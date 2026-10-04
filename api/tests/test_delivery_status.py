"""Advancing a delivery order's fulfilment status.

Pins the flow, the transition guard, the role rule (manager *and* cashier, not
kitchen), and that the customer's details reach the dashboard.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.catalog.models import Category, MenuItem
from apps.orders.models import Order
from apps.profiles.models import RestaurantProfile
from tests.factories import make_branch, make_manager


class DeliveryStatusTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch()
        now = timezone.now()
        self.profile = RestaurantProfile.objects.create(
            id=uuid.uuid4(), branch=self.branch, slug="m", name_ar="مطعم",
            landing_page_enabled=True, online_ordering_enabled=True,
            created_at=now, updated_at=now,
        )
        self.category = Category.objects.create(
            id=uuid.uuid4(), branch=self.branch, name_ar="وجبات", created_at=now, updated_at=now,
        )
        self.item = MenuItem.objects.create(
            id=uuid.uuid4(), branch=self.branch, category=self.category, name_ar="شاورما",
            price_minor=12500, created_at=now, updated_at=now,
        )
        self.public = APIClient()

    def place_order(self):
        body = {
            "customer_name": "أحمد", "customer_phone": "0912345678",
            "customer_address": "شارع النيل", "customer_area": "الخرطوم",
            "customer_notes": "بدون بصل",
            "items": [{"item_id": str(self.item.id), "qty": 1}],
        }
        return self.public.post("/api/v1/public/order/", body, format="json").data["id"]

    def as_role(self, username, role):
        make_manager(branch=self.branch, username=username, role=role, password="deliv-pass-123")
        c = APIClient()
        c.post("/api/v1/auth/login/", {"username": username, "password": "deliv-pass-123"}, format="json")
        return c

    def set_status(self, client, oid, value):
        body = {"delivery_status": value}
        if value == "cancelled":
            # Cancelling needs a reason since batch 11 (test_mistakes_and_money).
            body["reason"] = "طلب الزبون"
        return client.post(f"/api/v1/orders/{oid}/delivery-status/", body, format="json")

    def kitchen_says(self, oid, value):
        """The kitchen advancing its own ticket, which is the other half of the
        handover front-of-house waits on."""
        kitchen = self.as_role(f"k.{value}.{oid[:6]}", ManagerUser.Role.KITCHEN)
        return kitchen.post(f"/api/v1/kitchen/tickets/{oid}/status/",
                            {"kitchen_status": value}, format="json")


class DeliveryFlowTests(DeliveryStatusTestCase):
    def test_front_of_house_flow(self):
        # Confirm, then wait for the kitchen, then dispatch and deliver. The
        # turns alternate: nothing here is a claim about food being cooked.
        oid = self.place_order()
        m = self.as_role("m.deliv", ManagerUser.Role.MANAGER)

        r = self.set_status(m, oid, "confirmed")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["delivery_status"], "confirmed")

        self.kitchen_says(oid, "ready")

        for step in ["out_for_delivery", "delivered"]:
            r = self.set_status(m, oid, step)
            self.assertEqual(r.status_code, 200, step)
            self.assertEqual(r.data["delivery_status"], step)

    def test_front_of_house_cannot_dispatch_before_the_kitchen_is_ready(self):
        # The conflict this exists to prevent: a cashier sending a rider out
        # while the food is still being cooked. Confirming is his turn; what
        # happens next is the kitchen's, and he waits for it.
        oid = self.place_order()
        c = self.as_role("c.early", ManagerUser.Role.CASHIER)
        self.set_status(c, oid, "confirmed")

        r = self.set_status(c, oid, "out_for_delivery")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data["error"]["code"], "kitchen_not_ready")
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "confirmed")

    def test_dispatch_opens_the_moment_the_kitchen_says_ready(self):
        oid = self.place_order()
        c = self.as_role("c.ready", ManagerUser.Role.CASHIER)
        self.set_status(c, oid, "confirmed")
        self.kitchen_says(oid, "ready")

        r = self.set_status(c, oid, "out_for_delivery")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["delivery_status"], "out_for_delivery")

    def test_cooking_is_not_ready(self):
        # "Started" is not "finished"; only the second one is a handover.
        oid = self.place_order()
        c = self.as_role("c.cooking", ManagerUser.Role.CASHIER)
        self.set_status(c, oid, "confirmed")
        self.kitchen_says(oid, "preparing")

        r = self.set_status(c, oid, "out_for_delivery")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data["error"]["code"], "kitchen_not_ready")

    def test_an_already_served_ticket_can_still_be_dispatched(self):
        # A kitchen that marked the ticket served has done more than ready, not
        # less. Refusing here would strand the order with nobody able to move it.
        oid = self.place_order()
        c = self.as_role("c.served", ManagerUser.Role.CASHIER)
        self.set_status(c, oid, "confirmed")
        self.kitchen_says(oid, "ready")
        self.kitchen_says(oid, "served")

        r = self.set_status(c, oid, "out_for_delivery")
        self.assertEqual(r.status_code, 200)

    def test_cancelling_never_waits_for_the_kitchen(self):
        # A customer who calls to cancel while the food cooks must be able to,
        # so the gate covers dispatch only.
        oid = self.place_order()
        c = self.as_role("c.cancel2", ManagerUser.Role.CASHIER)
        self.set_status(c, oid, "confirmed")
        self.kitchen_says(oid, "preparing")

        r = self.set_status(c, oid, "cancelled")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "cancelled")

    def test_front_of_house_cannot_declare_food_is_being_prepared(self):
        # Cooking is the kitchen's to report; a cashier asserting it would be
        # reporting on a room they cannot see.
        oid = self.place_order()
        c = self.as_role("c.noprep", ManagerUser.Role.CASHIER)
        self.set_status(c, oid, "confirmed")
        r = self.set_status(c, oid, "preparing")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data["error"]["code"], "kitchen_owned_status")
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "confirmed")

    def test_the_kitchen_sets_preparing_by_starting_to_cook(self):
        oid = self.place_order()
        c = self.as_role("c.kit", ManagerUser.Role.CASHIER)
        self.set_status(c, oid, "confirmed")

        kitchen = self.as_role("k.cook", ManagerUser.Role.KITCHEN)
        r = kitchen.post(
            f"/api/v1/kitchen/tickets/{oid}/status/",
            {"kitchen_status": "preparing"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        # The delivery board now says "preparing" without anyone re-typing it.
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "preparing")

    def test_the_kitchen_does_not_resurrect_a_cancelled_delivery(self):
        oid = self.place_order()
        c = self.as_role("c.cancel2", ManagerUser.Role.CASHIER)
        self.set_status(c, oid, "cancelled")

        kitchen = self.as_role("k.cook2", ManagerUser.Role.KITCHEN)
        kitchen.post(
            f"/api/v1/kitchen/tickets/{oid}/status/",
            {"kitchen_status": "preparing"},
            format="json",
        )
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "cancelled")

    def test_a_dine_in_order_is_untouched_by_the_kitchen_mirror(self):
        # The mirror is only for customer deliveries; a POS ticket has no
        # delivery lifecycle and must not gain one.
        now = timezone.now()
        order = Order.objects.create(
            id=uuid.uuid4(), branch=self.branch, number="777", type=Order.Type.DINE_IN,
            status=Order.Status.SENT, opened_at=now, created_at=now, updated_at=now,
        )
        kitchen = self.as_role("k.dinein", ManagerUser.Role.KITCHEN)
        kitchen.post(
            f"/api/v1/kitchen/tickets/{order.id}/status/",
            {"kitchen_status": "preparing"},
            format="json",
        )
        self.assertEqual(Order.objects.get(id=order.id).delivery_status, "")

    def test_cashier_can_advance(self):
        oid = self.place_order()
        c = self.as_role("c.deliv", ManagerUser.Role.CASHIER)
        r = self.set_status(c, oid, "confirmed")
        self.assertEqual(r.status_code, 200)

    def test_kitchen_cannot_advance(self):
        oid = self.place_order()
        k = self.as_role("k.deliv", ManagerUser.Role.KITCHEN)
        r = self.set_status(k, oid, "confirmed")
        self.assertEqual(r.status_code, 403)

    def test_cancel_from_any_live_state(self):
        oid = self.place_order()
        m = self.as_role("m.cancel", ManagerUser.Role.MANAGER)
        self.set_status(m, oid, "confirmed")
        r = self.set_status(m, oid, "cancelled")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["delivery_status"], "cancelled")

    def test_illegal_skip_is_refused(self):
        oid = self.place_order()
        m = self.as_role("m.skip", ManagerUser.Role.MANAGER)
        # pending → delivered skips confirmation and dispatch entirely.
        r = self.set_status(m, oid, "delivered")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "pending")

    def test_terminal_state_cannot_move(self):
        oid = self.place_order()
        m = self.as_role("m.term", ManagerUser.Role.MANAGER)
        self.set_status(m, oid, "confirmed")
        self.kitchen_says(oid, "ready")
        for step in ["out_for_delivery", "delivered"]:
            self.set_status(m, oid, step)
        r = self.set_status(m, oid, "confirmed")
        self.assertEqual(r.status_code, 409)

    def test_a_pos_order_is_not_a_delivery(self):
        # An ordinary order with no delivery_status refuses the action.
        now = timezone.now()
        order = Order.objects.create(
            id=uuid.uuid4(), branch=self.branch, number="500", type=Order.Type.DINE_IN,
            status=Order.Status.CLOSED, opened_at=now, created_at=now, updated_at=now,
        )
        m = self.as_role("m.pos", ManagerUser.Role.MANAGER)
        r = self.set_status(m, str(order.id), "confirmed")
        self.assertEqual(r.status_code, 400)

    def test_customer_details_reach_the_dashboard(self):
        oid = self.place_order()
        m = self.as_role("m.read", ManagerUser.Role.MANAGER)
        r = m.get(f"/api/v1/orders/{oid}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["customer_name"], "أحمد")
        self.assertEqual(r.data["customer_phone"], "0912345678")
        self.assertEqual(r.data["customer_address"], "شارع النيل")
        self.assertEqual(r.data["delivery_status"], "pending")
        self.assertEqual(r.data["channel"], "online")

    def test_list_filters_by_channel(self):
        self.place_order()
        m = self.as_role("m.list", ManagerUser.Role.MANAGER)
        r = m.get("/api/v1/orders/?channel=online")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(all(o["channel"] == "online" for o in r.data["results"]))
        self.assertEqual(r.data["total"], 1)

    def test_cashier_reads_deliveries_but_not_the_full_order_list(self):
        self.place_order()
        c = self.as_role("c.list", ManagerUser.Role.CASHIER)
        # The delivery-only queue is open to the cashier…
        deliveries = c.get("/api/v1/orders/deliveries/")
        self.assertEqual(deliveries.status_code, 200)
        self.assertEqual(deliveries.data["total"], 1)
        self.assertEqual(deliveries.data["results"][0]["channel"], "online")
        # …but the full order list (with every POS order) is not.
        self.assertEqual(c.get("/api/v1/orders/").status_code, 403)

    def test_deliveries_action_returns_only_online_orders(self):
        self.place_order()
        now = timezone.now()
        Order.objects.create(  # a POS order that must not appear
            id=uuid.uuid4(), branch=self.branch, number="900", type=Order.Type.DINE_IN,
            status=Order.Status.CLOSED, opened_at=now, created_at=now, updated_at=now,
        )
        m = self.as_role("m.donly", ManagerUser.Role.MANAGER)
        r = m.get("/api/v1/orders/deliveries/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(all(o["channel"] == "online" for o in r.data["results"]))
        self.assertEqual(r.data["total"], 1)
