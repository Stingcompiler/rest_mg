"""Batch 16: pickup from the restaurant.

The customer orders from the page and comes to collect, paying at the
counter. As recommended (and agreed): the restaurant still calls to confirm
(D1), payment is at the till (D2), there are no scheduled times, and an order
left ready for an hour is cancelled as "the customer did not come".

A pickup order is a takeaway with its own fulfilment steps:
pending → confirmed → (kitchen) preparing → (kitchen) ready for pickup →
collected. It never goes out for delivery, and a delivery never waits at the
counter.
"""
from __future__ import annotations

from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone

from apps.accounts.models import ManagerUser
from apps.orders.models import Order, Payment
from tests.test_delivery_status import DeliveryStatusTestCase


class PickupTestCase(DeliveryStatusTestCase):
    def place(self, fulfilment="pickup", address=""):
        body = {
            "customer_name": "سارة", "customer_phone": "0912345678",
            "customer_address": address, "fulfilment": fulfilment,
            "items": [{"item_id": str(self.item.id), "qty": 1}],
        }
        return self.public.post("/api/v1/public/order/", body, format="json")


class PlacingPickupTests(PickupTestCase):
    def test_a_pickup_needs_no_address_and_is_a_takeaway(self):
        r = self.place()
        self.assertEqual(r.status_code, 201, r.data)
        order = Order.objects.get(id=r.data["id"])
        self.assertEqual(order.type, Order.Type.TAKEAWAY)
        self.assertEqual(order.delivery_status, Order.DeliveryStatus.PENDING)
        self.assertEqual(order.customer_address, "")

    def test_a_delivery_still_needs_an_address(self):
        r = self.place(fulfilment="delivery", address="")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["error"]["code"], "address_required")

    def test_delivery_is_the_default(self):
        r = self.public.post("/api/v1/public/order/", {
            "customer_name": "سارة", "customer_phone": "0912345678", "customer_address": "شارع النيل",
            "items": [{"item_id": str(self.item.id), "qty": 1}],
        }, format="json")
        self.assertEqual(Order.objects.get(id=r.data["id"]).type, Order.Type.DELIVERY)


class PickupFlowTests(PickupTestCase):
    def test_the_whole_pickup_flow(self):
        oid = self.place().data["id"]
        m = self.as_role("m.pickup", ManagerUser.Role.MANAGER)
        self.assertEqual(self.set_status(m, oid, "confirmed").status_code, 200)

        # The kitchen's "ready" is what tells the customer to come.
        self.kitchen_says(oid, "preparing")
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "preparing")
        self.kitchen_says(oid, "ready")
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "ready_for_pickup")
        self.assertEqual(self.public.get(f"/api/v1/public/order/{oid}/").data["delivery_status"], "ready_for_pickup")

        r = self.set_status(m, oid, "collected")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "collected")

    def test_ready_before_the_kitchen_is_refused(self):
        oid = self.place().data["id"]
        m = self.as_role("m.pickup2", ManagerUser.Role.MANAGER)
        self.set_status(m, oid, "confirmed")
        r = self.set_status(m, oid, "ready_for_pickup")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data["error"]["code"], "kitchen_not_ready")

    def test_a_pickup_never_goes_out_for_delivery(self):
        oid = self.place().data["id"]
        m = self.as_role("m.pickup3", ManagerUser.Role.MANAGER)
        self.set_status(m, oid, "confirmed")
        self.kitchen_says(oid, "ready")
        r = self.set_status(m, oid, "out_for_delivery")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data["error"]["code"], "invalid_transition")

    def test_a_delivery_never_waits_at_the_counter(self):
        oid = self.place(fulfilment="delivery", address="شارع النيل").data["id"]
        m = self.as_role("m.pickup4", ManagerUser.Role.MANAGER)
        self.set_status(m, oid, "confirmed")
        self.kitchen_says(oid, "ready")
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "confirmed")
        for step in ["ready_for_pickup", "collected"]:
            self.assertEqual(self.set_status(m, oid, step).status_code, 409, step)


class NoShowTests(PickupTestCase):
    def ready_since(self, minutes, paid=False):
        oid = self.place().data["id"]
        order = Order.objects.get(id=oid)
        order.delivery_status = Order.DeliveryStatus.READY_FOR_PICKUP
        order.kitchen_status = Order.KitchenStatus.READY
        order.kitchen_updated_at = timezone.now() - timedelta(minutes=minutes)
        order.save()
        if paid:
            Payment.objects.create(
                id=__import__("uuid").uuid4(), order=order, branch=order.branch, method="cash",
                amount_minor=order.total_minor, tendered_minor=order.total_minor, change_minor=0,
                taken_at=timezone.now(), created_at=timezone.now(), updated_at=timezone.now(),
            )
        return oid

    def test_an_order_left_an_hour_is_cancelled_as_a_no_show(self):
        late = self.ready_since(61)
        fresh = self.ready_since(30)
        paid = self.ready_since(90, paid=True)
        call_command("expire_pickups", stdout=StringIO())

        order = Order.objects.get(id=late)
        self.assertEqual(order.delivery_status, Order.DeliveryStatus.CANCELLED)
        self.assertEqual(order.status, Order.Status.VOID)
        self.assertEqual(order.void_reason, "لم يحضر الزبون")
        self.assertEqual(Order.objects.get(id=fresh).delivery_status, "ready_for_pickup")
        # Money taken is never voided by a timer.
        self.assertEqual(Order.objects.get(id=paid).delivery_status, "ready_for_pickup")
