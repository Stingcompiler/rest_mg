"""Amounts the server accepts and reports are right (batch 46).

Review of 10 October:

  - F06: a cash payment of 25,000 with 1 tendered and no change was accepted —
    the change rule took max(tendered − amount, 0). The till never sends it;
    an imported or hand-made record could.
  - F07: «لم تُحصَّل بعد» summed the totals of open bills: one of 25,000 with
    5,000 already paid read 25,000 owed, while its own page said 20,000.
  - F09: /api/v1/shifts/?limit=abc answered 500.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.orders.models import Order, Payment
from apps.orders.serializers import PaymentSerializer
from tests.factories import make_branch, make_manager
from tests.test_money_flow import MoneyFlowTests, make_order


def cash(amount, tendered, change=0):
    return {
        "id": str(uuid.uuid4()), "method": "cash", "amount_minor": str(amount),
        "tendered_minor": str(tendered), "change_minor": str(change),
        "taken_at": timezone.now().isoformat(),
    }


class TenderedCashTests(TestCase):
    def test_less_cash_handed_over_than_the_amount_is_refused(self):
        payment = PaymentSerializer(data=cash(25_000, 1))
        self.assertFalse(payment.is_valid())
        self.assertIn("tendered_minor", payment.errors)

    def test_enough_cash_with_the_right_change_is_accepted(self):
        self.assertTrue(PaymentSerializer(data=cash(25_000, 30_000, 5_000)).is_valid())
        self.assertTrue(PaymentSerializer(data=cash(25_000, 25_000, 0)).is_valid())


class UnpaidIsWhatIsLeftTests(TestCase):
    setUp = MoneyFlowTests.setUp
    report = MoneyFlowTests.report

    def test_a_part_paid_open_bill_counts_what_is_left(self):
        order = make_order(self.branch, status=Order.Status.SENT, total=25_000)
        now = timezone.now()
        Payment.objects.create(
            id=uuid.uuid4(), branch=self.branch, order=order, method=Payment.Method.CASH,
            amount_minor=5_000, taken_at=now, created_at=now, updated_at=now,
        )
        make_order(self.branch, status=Order.Status.PARKED, total=5_000)
        data = self.report()
        self.assertEqual(data["unpaid_minor"], "25000")  # 20,000 + 5,000
        self.assertEqual(data["unpaid_order_count"], 2)


class ShiftListLimitTests(TestCase):
    def setUp(self):
        branch = make_branch()
        make_manager(branch=branch, username="m.lim", role=ManagerUser.Role.MANAGER, password="lim-pass-1234")
        self.client = APIClient()
        self.client.post("/api/v1/auth/login/", {"username": "m.lim", "password": "lim-pass-1234"}, format="json")

    def test_a_nonsense_limit_never_500s(self):
        for raw in ("abc", "-5", "0", "99999999999999999999", ""):
            self.assertEqual(self.client.get(f"/api/v1/shifts/?limit={raw}").status_code, 200, raw)
