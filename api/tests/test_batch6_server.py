"""Server-side items of batch 6 (usability and localization).

- Report periods are half-open, ``from <= t < to``: the dashboard's "today"
  ends at the next midnight, and a bill closed exactly at midnight belongs to
  the new day, not to both.
- The kitchen board says how many tickets it is not showing: it lists the
  oldest 100, and a busy kitchen must know there are more.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone as dt_timezone

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.orders.models import Order
from tests.factories import make_branch, make_manager

MIDNIGHT = datetime(2026, 10, 2, 22, 0, tzinfo=dt_timezone.utc)  # 00:00 in Khartoum


class HalfOpenPeriodTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.client = APIClient()
        self.client.force_authenticate(make_manager(branch=self.branch))

    def closed_at(self, when, total=10_000):
        return Order.objects.create(
            id=uuid.uuid4(), branch=self.branch, number=f"Z-{uuid.uuid4().hex[:5]}", status="closed",
            subtotal_minor=total, total_minor=total, opened_at=when, closed_at=when,
            created_at=when, updated_at=when,
        )

    def report(self, start, end):
        return self.client.get(
            "/api/v1/reports/revenue/", {"from": start.isoformat(), "to": end.isoformat()}
        ).data

    def test_a_bill_closed_at_midnight_belongs_to_the_new_day_only(self):
        self.closed_at(MIDNIGHT)
        day_before = self.report(MIDNIGHT - timedelta(days=1), MIDNIGHT)
        day_after = self.report(MIDNIGHT, MIDNIGHT + timedelta(days=1))
        self.assertEqual(day_before["order_count"], 0)
        self.assertEqual(day_after["order_count"], 1)

    def test_the_order_list_uses_the_same_rule(self):
        order = self.closed_at(MIDNIGHT)
        Order.objects.filter(id=order.id).update(opened_at=MIDNIGHT)
        listed = self.client.get(
            "/api/v1/orders/",
            {"from": (MIDNIGHT - timedelta(days=1)).isoformat(), "to": MIDNIGHT.isoformat()},
        ).data
        self.assertEqual(listed["total"], 0)


class KitchenOverflowTests(TestCase):
    def test_the_board_says_how_many_tickets_it_holds_back(self):
        branch = make_branch()
        now = timezone.now()
        Order.objects.bulk_create(
            [
                Order(
                    id=uuid.uuid4(), branch=branch, number=f"K-{index}", status="sent",
                    opened_at=now, sent_at=now + timedelta(seconds=index), created_at=now, updated_at=now,
                )
                for index in range(103)
            ]
        )
        kitchen = APIClient()
        kitchen.force_authenticate(
            make_manager(branch=branch, username="k", role=ManagerUser.Role.KITCHEN)
        )
        board = kitchen.get("/api/v1/kitchen/tickets/").data
        self.assertEqual(len(board["tickets"]), 100)
        self.assertEqual(board["total"], 103)
        self.assertEqual(board["tickets"][0]["number"], "K-0")
