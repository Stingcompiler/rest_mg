"""Batch 17: no-shows are cancelled without a cron job.

`expire_pickups` needed a scheduled job, which on Render is a separate paid
service. The check now also runs on the requests the restaurant already
makes: the deliveries board polls every fifteen seconds and every till syncs
every thirty. It runs at most once a minute (a cache flag), and only with
someone working, which is when it matters.
"""
from __future__ import annotations

from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.orders.models import Order
from tests.factories import make_device
from tests.test_pickup import NoShowTests


class AutomaticExpiryTests(NoShowTests):
    def setUp(self):
        super().setUp()
        cache.clear()

    def test_the_deliveries_board_cancels_a_no_show(self):
        late = self.ready_since(61)
        cashier = self.as_role("c.auto", ManagerUser.Role.CASHIER)
        rows = cashier.get("/api/v1/orders/deliveries/").data["results"]
        self.assertEqual(Order.objects.get(id=late).delivery_status, "cancelled")
        self.assertEqual(next(r for r in rows if r["id"] == late)["delivery_status"], "cancelled")

    def test_a_till_sync_cancels_a_no_show(self):
        late = self.ready_since(61)
        _, token = make_device(self.branch)
        till = APIClient()
        till.credentials(HTTP_AUTHORIZATION=f"Device {token}")
        self.assertEqual(till.get("/api/v1/sync/pull/").status_code, 200)
        self.assertEqual(Order.objects.get(id=late).void_reason, "لم يحضر الزبون")

    def test_it_runs_at_most_once_a_minute(self):
        cashier = self.as_role("c.auto2", ManagerUser.Role.CASHIER)
        cashier.get("/api/v1/orders/deliveries/")
        late = self.ready_since(61)
        cashier.get("/api/v1/orders/deliveries/")
        # The second poll fell inside the minute: the order waits for the next.
        self.assertEqual(Order.objects.get(id=late).delivery_status, "ready_for_pickup")

    def test_paid_and_fresh_orders_are_left_alone(self):
        fresh = self.ready_since(20)
        paid = self.ready_since(90, paid=True)
        self.as_role("c.auto3", ManagerUser.Role.CASHIER).get("/api/v1/orders/deliveries/")
        self.assertEqual(Order.objects.get(id=fresh).delivery_status, "ready_for_pickup")
        self.assertEqual(Order.objects.get(id=paid).delivery_status, "ready_for_pickup")
