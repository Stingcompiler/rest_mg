"""Filtering the activity log by who acted, when, and on what."""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.audit.models import AuditLog
from tests.factories import make_branch, make_manager


class AuditFilterTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.manager = make_manager(branch=self.branch, display_name="المدير")
        self.cashier = make_manager(
            branch=self.branch, username="cashier.audit",
            role=ManagerUser.Role.CASHIER, display_name="سمية",
        )
        self.client = APIClient()
        self.client.post("/api/v1/auth/login/",
                         {"username": "manager", "password": "correct-horse-battery"},
                         format="json")

        now = timezone.now()
        self.old = now - timezone.timedelta(days=10)
        # Two people, two kinds of action, two days.
        AuditLog.objects.create(branch=self.branch, action=AuditLog.Action.STAFF_CREATED,
                                actor_id=self.manager.id, actor_name="المدير", target_label="عمر")
        AuditLog.objects.create(branch=self.branch, action=AuditLog.Action.ITEM_CREATED,
                                actor_id=self.cashier.id, actor_name="سمية", target_label="شاي")
        stale = AuditLog.objects.create(branch=self.branch, action=AuditLog.Action.ITEM_RETIRED,
                                        actor_id=self.cashier.id, actor_name="سمية", target_label="كبدة")
        # created_at is auto_now_add, so age it deliberately.
        AuditLog.objects.filter(pk=stale.pk).update(created_at=self.old)

    def get(self, query=""):
        return self.client.get(f"/api/v1/audit/log/{query}")

    def test_unfiltered_returns_everything(self):
        self.assertEqual(self.get().data["total"], 3)

    def test_filter_by_actor(self):
        response = self.get(f"?actor={self.cashier.id}")
        self.assertEqual(response.data["total"], 2)
        self.assertTrue(all(e["actor_name"] == "سمية" for e in response.data["results"]))

    def test_filter_by_exact_action(self):
        response = self.get("?action=item.created")
        self.assertEqual(response.data["total"], 1)
        self.assertEqual(response.data["results"][0]["target_label"], "شاي")

    def test_filter_by_action_family(self):
        # A bare prefix matches the whole family, so a manager can ask for
        # "everything about the menu" without listing every variant.
        response = self.get("?action=item")
        self.assertEqual(response.data["total"], 2)

    def test_filter_by_date_window(self):
        since = (timezone.now() - timezone.timedelta(days=1)).isoformat()
        response = self.get(f"?from={since}")
        self.assertEqual(response.data["total"], 2)  # the ten-day-old one drops out

    def test_actor_and_date_compose(self):
        since = (timezone.now() - timezone.timedelta(days=1)).isoformat()
        response = self.get(f"?actor={self.cashier.id}&from={since}")
        self.assertEqual(response.data["total"], 1)
        self.assertEqual(response.data["results"][0]["target_label"], "شاي")

    def test_a_malformed_date_is_refused_not_crashed(self):
        self.assertEqual(self.get("?from=yesterday").status_code, 400)

    def test_actors_endpoint_lists_who_appears_in_the_log(self):
        response = self.client.get("/api/v1/audit/log/actors/")
        self.assertEqual(response.status_code, 200)
        names = sorted(a["name"] for a in response.data)
        self.assertEqual(names, ["المدير", "سمية"])

    def test_a_cashier_cannot_read_the_log(self):
        cashier = APIClient()
        make_manager(branch=self.branch, username="c.nolog",
                     role=ManagerUser.Role.CASHIER, password="nolog-pass-1")
        cashier.post("/api/v1/auth/login/",
                     {"username": "c.nolog", "password": "nolog-pass-1"}, format="json")
        self.assertEqual(cashier.get("/api/v1/audit/log/").status_code, 403)
        self.assertEqual(cashier.get("/api/v1/audit/log/actors/").status_code, 403)
