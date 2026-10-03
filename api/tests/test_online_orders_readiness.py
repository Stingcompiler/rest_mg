"""Website orders, made ready to switch on (implementation plan, batch 4).

Decisions this pins:

- D1 — the floor confirms a website order before the kitchen sees or starts it.
- D2 — a website order is collected at the till, inside a shift: the till takes
  a copy, records the payment, and pushes the bill closed. The server keeps what
  the customer ordered (items, total, delivery details); the till brings only
  the money, the cashier and the shift.

And the review findings it closes: F05 (a delivered order had no way to be
paid), F06 (a cancelled delivery stayed on the kitchen board and in the unpaid
total), repeated submissions creating duplicate orders, no limit on the public
endpoint, featured items from a retired category, and the order number race.
"""
from __future__ import annotations

import uuid

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.catalog.models import Category, MenuItem
from apps.orders.models import Order
from tests.factories import envelope, make_device, record
from tests.test_delivery_status import DeliveryStatusTestCase

LOCMEM = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


class OnlineOrderTestCase(DeliveryStatusTestCase):
    def setUp(self):
        super().setUp()
        self.cashier = self.as_role("c.till", ManagerUser.Role.CASHIER)
        _, token = make_device(self.branch)
        self.tablet = APIClient()
        self.tablet.credentials(HTTP_AUTHORIZATION=f"Device {token}")

    def confirmed_order(self) -> str:
        oid = self.place_order()
        self.assertEqual(self.set_status(self.cashier, oid, "confirmed").status_code, 200)
        return oid

    def collection(self, oid, *, status="closed", total=None, payment_id=None) -> dict:
        """The bill as the till pushes it after taking the money."""
        order = Order.objects.prefetch_related("lines").get(id=oid)
        total = order.total_minor if total is None else total
        now = timezone.now().isoformat()
        return {
            "id": str(order.id),
            "number": order.number,
            "type": "delivery",
            "status": status,
            "subtotal_minor": str(total),
            "discount_minor": "0",
            "total_minor": str(total),
            "opened_at": order.opened_at.isoformat(),
            "sent_at": order.sent_at.isoformat() if order.sent_at else None,
            "closed_at": now if status == "closed" else None,
            "cashier_name": "سمية",
            "shift_ref": str(uuid.uuid4()),
            "lines": [
                {
                    "id": str(line.id),
                    "item_id": str(line.item_id),
                    "name_ar": line.name_ar,
                    "unit_price_minor": str(total // line.qty),
                    "qty": line.qty,
                    "line_total_minor": str(total),
                }
                for line in order.lines.all()
            ],
            "payments": []
            if status != "closed"
            else [
                {
                    "id": str(payment_id or uuid.uuid4()),
                    "method": "cash",
                    "amount_minor": str(total),
                    "tendered_minor": str(total),
                    "change_minor": "0",
                    "taken_at": now,
                }
            ],
        }

    def push(self, payload) -> dict:
        response = self.tablet.post("/api/v1/sync/push/", envelope(record("order", payload)), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["results"][0]

    def manager(self) -> APIClient:
        return self.as_role(f"m.{uuid.uuid4().hex[:6]}", ManagerUser.Role.MANAGER)

    def kitchen(self) -> APIClient:
        return self.as_role(f"k.{uuid.uuid4().hex[:6]}", ManagerUser.Role.KITCHEN)


class CollectingAtTheTillTests(OnlineOrderTestCase):
    def test_collecting_settles_the_order_and_keeps_what_the_customer_ordered(self):
        oid = self.confirmed_order()
        payload = self.collection(oid)
        self.assertEqual(self.push(payload)["status"], "accepted")

        order = Order.objects.get(id=oid)
        self.assertEqual(order.status, "closed")
        self.assertEqual(order.channel, "online")
        self.assertEqual(order.type, "delivery")
        self.assertEqual(order.delivery_status, "confirmed")
        self.assertEqual(order.customer_name, "أحمد")
        self.assertEqual(order.customer_notes, "بدون بصل")
        self.assertEqual(order.amount_paid_minor, 12_500)
        self.assertEqual(order.amount_due_minor, 0)
        self.assertEqual(str(order.shift_ref), payload["shift_ref"])
        self.assertEqual(order.cashier_name, "سمية")
        self.assertEqual(order.lines.count(), 1)

    def test_the_till_cannot_change_the_total_of_a_website_order(self):
        oid = self.confirmed_order()
        result = self.push(self.collection(oid, total=25_000))
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["reason"]["code"], "order_changed")
        order = Order.objects.get(id=oid)
        self.assertEqual(order.status, "sent")
        self.assertEqual(order.payments.count(), 0)

    def test_an_unconfirmed_order_cannot_be_collected(self):
        oid = self.place_order()
        result = self.push(self.collection(oid))
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["reason"]["code"], "not_confirmed")
        self.assertEqual(Order.objects.get(id=oid).status, "sent")

    def test_resending_the_same_collection_is_a_duplicate(self):
        oid = self.confirmed_order()
        payload = self.collection(oid)
        self.push(payload)
        self.assertEqual(self.push(payload)["status"], "duplicate")
        self.assertEqual(Order.objects.get(id=oid).payments.count(), 1)

    def test_a_second_till_collecting_the_same_order_is_refused_and_says_so(self):
        oid = self.confirmed_order()
        first = self.collection(oid)
        self.push(first)
        second = self.push(self.collection(oid))
        self.assertEqual(second["status"], "rejected")
        self.assertEqual(second["reason"]["code"], "already_settled")
        order = Order.objects.get(id=oid)
        self.assertEqual(
            [str(p.id) for p in order.payments.all()], [first["payments"][0]["id"]]
        )

    def test_a_till_cannot_void_a_website_order(self):
        oid = self.confirmed_order()
        payload = self.collection(oid, status="void")
        payload["void_reason"] = "test"
        result = self.push(payload)
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["reason"]["code"], "cancel_from_deliveries")
        self.assertEqual(Order.objects.get(id=oid).status, "sent")

    def test_a_collected_order_counts_as_collected_not_unpaid(self):
        oid = self.confirmed_order()
        before = self.manager().get("/api/v1/reports/revenue/").data
        self.assertEqual(before["unpaid_minor"], "12500")
        self.push(self.collection(oid))
        after = self.manager().get("/api/v1/reports/revenue/").data
        self.assertEqual(after["unpaid_minor"], "0")
        self.assertEqual(after["collected_minor"], "12500")


class CancellingTests(OnlineOrderTestCase):
    def test_cancelling_an_unpaid_order_takes_it_out_of_the_kitchen_and_the_unpaid_total(self):
        oid = self.confirmed_order()
        self.assertIn(oid, [t["id"] for t in self.kitchen().get("/api/v1/kitchen/tickets/").data["tickets"]])

        response = self.set_status(self.cashier, oid, "cancelled")
        self.assertEqual(response.status_code, 200, response.data)

        order = Order.objects.get(id=oid)
        self.assertEqual(order.delivery_status, "cancelled")
        self.assertEqual(order.status, "void")
        self.assertNotIn(oid, [t["id"] for t in self.kitchen().get("/api/v1/kitchen/tickets/").data["tickets"]])
        report = self.manager().get("/api/v1/reports/revenue/").data
        self.assertEqual(report["unpaid_minor"], "0")
        self.assertEqual(report["void_minor"], "12500")

    def test_a_pending_order_can_be_cancelled_too(self):
        oid = self.place_order()
        self.assertEqual(self.set_status(self.cashier, oid, "cancelled").status_code, 200)
        self.assertEqual(Order.objects.get(id=oid).status, "void")

    def test_a_paid_order_is_not_cancelled_without_a_refund(self):
        oid = self.confirmed_order()
        self.push(self.collection(oid))
        response = self.set_status(self.cashier, oid, "cancelled")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "paid_order_cancel")
        order = Order.objects.get(id=oid)
        self.assertEqual(order.status, "closed")
        self.assertEqual(order.delivery_status, "confirmed")


class KitchenConfirmationTests(OnlineOrderTestCase):
    def board(self):
        return [t["id"] for t in self.kitchen().get("/api/v1/kitchen/tickets/").data["tickets"]]

    def test_an_unconfirmed_order_is_not_on_the_kitchen_board(self):
        oid = self.place_order()
        self.assertNotIn(oid, self.board())
        self.set_status(self.cashier, oid, "confirmed")
        self.assertIn(oid, self.board())

    def test_the_kitchen_cannot_start_an_unconfirmed_order(self):
        oid = self.place_order()
        response = self.kitchen().post(
            f"/api/v1/kitchen/tickets/{oid}/status/", {"kitchen_status": "preparing"}, format="json"
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "not_confirmed")
        order = Order.objects.get(id=oid)
        self.assertEqual(order.kitchen_status, "queued")
        self.assertEqual(order.delivery_status, "pending")

    def test_the_kitchen_cannot_work_a_cancelled_order(self):
        oid = self.confirmed_order()
        self.set_status(self.cashier, oid, "cancelled")
        response = self.kitchen().post(
            f"/api/v1/kitchen/tickets/{oid}/status/", {"kitchen_status": "preparing"}, format="json"
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "order_cancelled")
        self.assertEqual(Order.objects.get(id=oid).kitchen_status, "queued")


class IdempotencyTests(DeliveryStatusTestCase):
    def body(self):
        return {
            "customer_name": "أحمد", "customer_phone": "0912345678",
            "customer_address": "شارع النيل",
            "items": [{"item_id": str(self.item.id), "qty": 1}],
        }

    def post(self, key=None):
        extra = {"HTTP_IDEMPOTENCY_KEY": key} if key is not None else {}
        return self.public.post("/api/v1/public/order/", self.body(), format="json", **extra)

    def test_the_same_attempt_sent_twice_places_one_order(self):
        key = str(uuid.uuid4())
        first = self.post(key)
        again = self.post(key)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["id"], first.data["id"])
        self.assertEqual(again.data["number"], first.data["number"])
        self.assertEqual(Order.objects.filter(channel="online").count(), 1)

    def test_two_attempts_with_the_same_items_are_two_orders(self):
        self.post(str(uuid.uuid4()))
        self.post(str(uuid.uuid4()))
        self.assertEqual(Order.objects.filter(channel="online").count(), 2)

    def test_a_malformed_key_is_refused(self):
        self.assertEqual(self.post("not-a-uuid").status_code, 400)
        self.assertEqual(Order.objects.filter(channel="online").count(), 0)


@override_settings(CACHES=LOCMEM)
class PublicOrderLimitTests(DeliveryStatusTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def tearDown(self):
        cache.clear()

    def post(self, phone="0912345678", address="10.1.0.1", qty_lines=1):
        body = {
            "customer_name": "أحمد", "customer_phone": phone, "customer_address": "شارع النيل",
            "items": [{"item_id": str(self.item.id), "qty": 1}] * qty_lines,
        }
        return self.public.post("/api/v1/public/order/", body, format="json", REMOTE_ADDR=address)

    def test_one_phone_number_is_limited(self):
        for index in range(5):
            self.assertEqual(self.post(address=f"10.1.1.{index}").status_code, 201)
        response = self.post(phone="0912 345 678", address="10.1.1.99")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["error"]["code"], "rate_limited")

    def test_one_address_is_limited(self):
        for index in range(30):
            self.assertEqual(self.post(phone=f"09100000{index:02d}").status_code, 201)
        self.assertEqual(self.post(phone="0919999999").status_code, 429)

    def test_an_order_with_too_many_lines_is_refused(self):
        self.assertEqual(self.post(qty_lines=51).status_code, 400)


class PublicMenuTests(DeliveryStatusTestCase):
    def test_a_featured_item_in_a_retired_category_is_not_offered(self):
        now = timezone.now()
        retired = Category.objects.create(
            id=uuid.uuid4(), branch=self.branch, name_ar="قديمة", is_active=False,
            created_at=now, updated_at=now,
        )
        hidden = MenuItem.objects.create(
            id=uuid.uuid4(), branch=self.branch, category=retired, name_ar="قديم",
            price_minor=1000, is_featured=True, created_at=now, updated_at=now,
        )
        featured = [row["id"] for row in self.public.get("/api/v1/public/").data["featured"]]
        self.assertNotIn(str(hidden.id), featured)


class OrderNumberTests(DeliveryStatusTestCase):
    def test_website_numbers_continue_after_the_highest_number_in_use(self):
        now = timezone.now()
        Order.objects.create(
            id=uuid.uuid4(), branch=self.branch, number="2000", status="closed",
            opened_at=now, created_at=now, updated_at=now,
        )
        first = Order.objects.get(id=self.place_order()).number
        second = Order.objects.get(id=self.place_order()).number
        self.assertEqual((first, second), ("2001", "2002"))
