"""The manager's revenue report must describe the *whole* flow of money.

Reporting only on closed orders hid three real amounts: what has been ordered
but not yet paid (every online delivery lives here until a cashier settles it),
what was given away as discount, and what was voided.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.orders.models import Order, Payment
from tests.factories import make_branch, make_manager


def make_order(branch, *, status, total, discount=0, channel=Order.Channel.POS,
               type_=Order.Type.DINE_IN, delivery_status=""):
    now = timezone.now()
    return Order.objects.create(
        id=uuid.uuid4(), branch=branch, number=str(uuid.uuid4().int)[:4],
        type=type_, status=status, channel=channel, delivery_status=delivery_status,
        subtotal_minor=total + discount, discount_minor=discount, total_minor=total,
        opened_at=now, closed_at=now if status == Order.Status.CLOSED else None,
        created_at=now, updated_at=now,
    )


class MoneyFlowTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        make_manager(branch=self.branch, username="m.money", role=ManagerUser.Role.MANAGER,
                     password="money-pass-123")
        self.client = APIClient()
        self.client.post("/api/v1/auth/login/",
                         {"username": "m.money", "password": "money-pass-123"}, format="json")

    def report(self):
        r = self.client.get("/api/v1/reports/revenue/")
        self.assertEqual(r.status_code, 200)
        return r.data

    def test_discounts_given_are_reported(self):
        make_order(self.branch, status=Order.Status.CLOSED, total=9_000, discount=1_000)
        self.assertEqual(self.report()["discount_minor"], "1000")

    def test_unpaid_orders_are_counted_as_money_in_flight(self):
        make_order(self.branch, status=Order.Status.SENT, total=15_000)
        make_order(self.branch, status=Order.Status.PARKED, total=5_000)
        make_order(self.branch, status=Order.Status.CLOSED, total=1_000)  # not in flight
        data = self.report()
        self.assertEqual(data["unpaid_order_count"], 2)
        self.assertEqual(data["unpaid_minor"], "20000")

    def test_an_online_delivery_shows_as_unpaid_not_as_nothing(self):
        # The gap that started this: an online order arrives `sent` and used to
        # be invisible to every figure on the dashboard.
        make_order(self.branch, status=Order.Status.SENT, total=30_000,
                   channel=Order.Channel.ONLINE, type_=Order.Type.DELIVERY,
                   delivery_status=Order.DeliveryStatus.PENDING)
        data = self.report()
        self.assertEqual(data["unpaid_minor"], "30000")
        self.assertEqual(data["pending_delivery_count"], 1)

    def test_a_delivered_order_is_no_longer_pending(self):
        make_order(self.branch, status=Order.Status.SENT, total=10_000,
                   channel=Order.Channel.ONLINE, type_=Order.Type.DELIVERY,
                   delivery_status=Order.DeliveryStatus.DELIVERED)
        self.assertEqual(self.report()["pending_delivery_count"], 0)

    def test_voided_orders_are_reported(self):
        make_order(self.branch, status=Order.Status.VOID, total=7_500)
        data = self.report()
        self.assertEqual(data["void_order_count"], 1)
        self.assertEqual(data["void_minor"], "7500")

    def test_money_is_split_by_type_and_channel_not_only_counted(self):
        make_order(self.branch, status=Order.Status.CLOSED, total=10_000, type_=Order.Type.DINE_IN)
        make_order(self.branch, status=Order.Status.CLOSED, total=25_000,
                   type_=Order.Type.DELIVERY, channel=Order.Channel.ONLINE)
        data = self.report()
        self.assertEqual(data["by_type_minor"]["dine_in"], "10000")
        self.assertEqual(data["by_type_minor"]["delivery"], "25000")
        self.assertEqual(data["by_channel_minor"]["online"], "25000")
        self.assertEqual(data["by_channel_minor"]["pos"], "10000")

    def test_the_original_figures_are_unchanged(self):
        # The additions are additive: existing keys keep their meaning.
        order = make_order(self.branch, status=Order.Status.CLOSED, total=20_000)
        now = timezone.now()
        Payment.objects.create(id=uuid.uuid4(), branch=self.branch, order=order,
                               method=Payment.Method.CASH, amount_minor=20_000,
                               taken_at=now, created_at=now, updated_at=now)
        data = self.report()
        self.assertEqual(data["order_count"], 1)
        self.assertEqual(data["gross_minor"], "20000")
        self.assertEqual(data["collected_minor"], "20000")
        self.assertEqual(data["average_ticket_minor"], "20000")
        self.assertEqual(data["by_method"]["cash"], "20000")
