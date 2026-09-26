"""The date window a report is asked for.

A malformed `from`/`to` used to reach the ORM untouched and surface as a 500 —
the caller sent a bad parameter and the server reported its own failure.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.orders.models import Order
from tests.factories import make_branch, make_manager


class ReportWindowTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        make_manager(branch=self.branch, username="m.win", role=ManagerUser.Role.MANAGER,
                     password="window-pass-1")
        self.client = APIClient()
        self.client.post("/api/v1/auth/login/",
                         {"username": "m.win", "password": "window-pass-1"}, format="json")
        now = timezone.now()
        self.today = Order.objects.create(
            id=uuid.uuid4(), branch=self.branch, number="900", status=Order.Status.CLOSED,
            total_minor=10_000, opened_at=now, closed_at=now, created_at=now, updated_at=now,
        )
        old = now - timezone.timedelta(days=40)
        Order.objects.create(
            id=uuid.uuid4(), branch=self.branch, number="901", status=Order.Status.CLOSED,
            total_minor=99_000, opened_at=old, closed_at=old, created_at=old, updated_at=old,
        )

    def get(self, query=""):
        return self.client.get(f"/api/v1/reports/revenue/{query}")

    def test_no_window_reports_everything(self):
        self.assertEqual(self.get().data["order_count"], 2)

    def test_a_window_narrows_the_report(self):
        start = (timezone.now() - timezone.timedelta(days=1)).isoformat()
        self.assertEqual(self.get(f"?from={start}").data["order_count"], 1)

    def test_a_plain_date_is_accepted(self):
        day = timezone.localtime().date().isoformat()
        response = self.get(f"?from={day}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["order_count"], 1)

    def test_an_offset_whose_plus_became_a_space_is_still_understood(self):
        # An unencoded "+" arrives as a space; that is a URL-encoding subtlety,
        # not a reason to refuse the caller.
        response = self.get("?from=2020-01-01T00:00:00 02:00")
        self.assertEqual(response.status_code, 200)

    def test_a_malformed_date_is_refused_not_crashed(self):
        for bad in ["not-a-date", "2026-13-45", "yesterday"]:
            response = self.get(f"?from={bad}")
            self.assertEqual(response.status_code, 400, bad)

    def test_a_malformed_date_on_the_order_list_is_also_refused(self):
        response = self.client.get("/api/v1/orders/?from=not-a-date")
        self.assertEqual(response.status_code, 400)
