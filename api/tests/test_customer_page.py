"""Batch 14 on the server: a customer can see where their order is.

After ordering, the page showed the order number and "we'll contact you",
and closing it lost the number (user-experience review). The page now keeps
the order and asks the server how it stands. The answer is only the status:
nothing about the customer, and only for a website order, by its unguessable
id.
"""
from __future__ import annotations

import uuid

from apps.accounts.models import ManagerUser
from apps.orders.models import Order
from tests.test_delivery_status import DeliveryStatusTestCase


class PublicOrderStatusTests(DeliveryStatusTestCase):
    def status(self, order_id):
        return self.public.get(f"/api/v1/public/order/{order_id}/")

    def test_a_placed_order_reports_its_status(self):
        oid = self.place_order()
        r = self.status(oid)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["delivery_status"], "pending")
        self.assertEqual(r.data["number"], Order.objects.get(id=oid).number)
        self.assertEqual(r.data["total_minor"], "12500")

    def test_the_status_follows_the_restaurant(self):
        oid = self.place_order()
        manager = self.as_role("m.status", ManagerUser.Role.MANAGER)
        self.set_status(manager, oid, "confirmed")
        self.assertEqual(self.status(oid).data["delivery_status"], "confirmed")

    def test_it_says_nothing_about_the_customer(self):
        oid = self.place_order()
        body = self.status(oid).data
        for field in ["customer_name", "customer_phone", "customer_address", "customer_notes", "lines"]:
            self.assertNotIn(field, body)

    def test_an_unknown_or_till_order_is_not_found(self):
        self.assertEqual(self.status(uuid.uuid4()).status_code, 404)
        oid = self.place_order()
        Order.objects.filter(id=oid).update(channel=Order.Channel.POS)
        self.assertEqual(self.status(oid).status_code, 404)
