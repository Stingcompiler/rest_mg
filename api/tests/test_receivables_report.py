"""Receivables on the manager dashboard (review finding F11).

The "open receivables" figure summed credit (آجل) payments taken in the period
and never subtracted what customers later paid back: a 25,000 credit sale fully
settled in cash still showed 25,000 owed, while the customer's own account read
zero. The report now keeps three figures apart:

- ``credit_sales_minor``: credit given on bills closed in the period;
- ``credit_outstanding_minor``: what is still owed at the end of the period —
  every credit payment up to then, less every settlement up to then;
- ``settlements_minor``: what customers paid back during the period.

A settlement is money received, but not a new sale: it never enters
``collected_minor``, which stays the cash, bank and wallet taken on bills.
"""
from __future__ import annotations

import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.customers.models import Customer, CustomerSettlement
from apps.orders.models import Order, Payment
from tests.factories import make_branch, make_manager


class ReceivablesReportTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.client = APIClient()
        self.client.force_authenticate(make_manager(branch=self.branch))
        now = timezone.now()
        self.customer = Customer.objects.create(
            id=uuid.uuid4(), branch=self.branch, name="عميل آجل", created_at=now, updated_at=now
        )

    def credit_sale(self, amount: int, at):
        order = Order.objects.create(
            id=uuid.uuid4(), branch=self.branch, number=f"C-{uuid.uuid4().hex[:6]}", status="closed",
            subtotal_minor=amount, total_minor=amount, opened_at=at, closed_at=at,
            created_at=at, updated_at=at,
        )
        Payment.objects.create(
            id=uuid.uuid4(), branch=self.branch, order=order, method="credit", amount_minor=amount,
            customer_id=self.customer.id, taken_at=at, created_at=at, updated_at=at,
        )

    def settle(self, amount: int, at, method: str = "cash"):
        CustomerSettlement.objects.create(
            id=uuid.uuid4(), branch=self.branch, customer=self.customer, amount_minor=amount,
            method=method, taken_at=at, created_at=at, updated_at=at,
        )

    def report(self, **window):
        params = {key: value.isoformat() for key, value in window.items()}
        response = self.client.get("/api/v1/reports/revenue/", params)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_a_fully_settled_credit_sale_is_no_longer_owed(self):
        now = timezone.now()
        self.credit_sale(25_000, now)
        response = self.client.post(
            f"/api/v1/customers/{self.customer.id}/settle/",
            {"amount_minor": "25000", "method": "cash"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

        report = self.report()
        self.assertEqual(report["credit_outstanding_minor"], "0")
        self.assertEqual(report["credit_sales_minor"], "25000")
        self.assertEqual(report["settlements_minor"], "25000")
        self.assertEqual(report["collected_minor"], "0")

    def test_a_partial_settlement_leaves_the_rest_owed(self):
        now = timezone.now()
        self.credit_sale(25_000, now)
        self.settle(10_000, now)
        report = self.report()
        self.assertEqual(report["credit_outstanding_minor"], "15000")
        self.assertEqual(report["settlements_minor"], "10000")

    def test_what_was_owed_at_the_end_of_a_past_period(self):
        sold = timezone.now() - timedelta(days=3)
        self.credit_sale(25_000, sold)
        self.settle(25_000, timezone.now())

        past = self.report(**{"from": sold - timedelta(hours=1), "to": sold + timedelta(hours=1)})
        self.assertEqual(past["credit_outstanding_minor"], "25000")
        self.assertEqual(past["credit_sales_minor"], "25000")
        self.assertEqual(past["settlements_minor"], "0")

    def test_an_old_debt_still_counts_as_owed_in_a_later_period(self):
        self.credit_sale(25_000, timezone.now() - timedelta(days=10))
        today = timezone.now()
        report = self.report(**{"from": today - timedelta(hours=1), "to": today + timedelta(hours=1)})
        self.assertEqual(report["credit_sales_minor"], "0")
        self.assertEqual(report["credit_outstanding_minor"], "25000")

    def test_settlements_are_split_by_method(self):
        now = timezone.now()
        self.credit_sale(30_000, now)
        self.settle(10_000, now, "cash")
        self.settle(20_000, now, "bank")
        report = self.report()
        self.assertEqual(report["settlements_by_method"], {"cash": "10000", "bank": "20000"})
