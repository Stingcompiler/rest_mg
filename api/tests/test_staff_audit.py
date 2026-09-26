"""Staff administration and the activity log it writes.

The two are tested together on purpose: the log is not a separate feature a
client posts to, it is a by-product of the staff actions, so the way to prove it
works is to perform the actions and read what they recorded.
"""
from __future__ import annotations

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.audit.models import AuditLog
from tests.factories import make_branch, make_manager


class StaffTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.manager = make_manager(branch=self.branch, display_name="المدير")
        self.client = APIClient()
        self.client.post(
            "/api/v1/auth/login/",
            {"username": "manager", "password": "correct-horse-battery"},
            format="json",
        )

    def create_person(self, **over):
        body = {
            "username": "cashier.day",
            "display_name": "سمية",
            "role": "cashier",
            "password": "opensesame1",
            **over,
        }
        return self.client.post("/api/v1/staff/", body, format="json")


class StaffCrudTests(StaffTestCase):
    def test_manager_creates_a_user(self):
        response = self.create_person()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["display_name"], "سمية")
        self.assertTrue(ManagerUser.objects.filter(username="cashier.day").exists())

    def test_created_user_can_sign_in(self):
        self.create_person()
        fresh = APIClient()
        response = fresh.post(
            "/api/v1/auth/login/",
            {"username": "cashier.day", "password": "opensesame1"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "cashier")

    def test_edit_changes_details(self):
        pid = self.create_person().data["id"]
        response = self.client.put(
            f"/api/v1/staff/{pid}/",
            {"display_name": "سمية عبد الله", "role": "kitchen"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["display_name"], "سمية عبد الله")
        self.assertEqual(response.data["role"], "kitchen")

    def test_edit_can_reset_password(self):
        pid = self.create_person().data["id"]
        self.client.put(f"/api/v1/staff/{pid}/", {"password": "brandnewpass9"}, format="json")
        fresh = APIClient()
        ok = fresh.post(
            "/api/v1/auth/login/",
            {"username": "cashier.day", "password": "brandnewpass9"},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)

    def test_username_collision_on_edit_is_refused(self):
        first = self.create_person().data["id"]
        self.create_person(username="cashier.night", display_name="عمر")
        response = self.client.put(
            f"/api/v1/staff/{first}/", {"username": "cashier.night"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_deactivate_then_reactivate(self):
        pid = self.create_person().data["id"]
        gone = self.client.delete(f"/api/v1/staff/{pid}/")
        self.assertEqual(gone.status_code, 200)
        self.assertFalse(gone.data["is_active"])

        back = self.client.put(f"/api/v1/staff/{pid}/", {"is_active": True}, format="json")
        self.assertTrue(back.data["is_active"])

    def test_manager_cannot_deactivate_themselves(self):
        response = self.client.delete(f"/api/v1/staff/{self.manager.id}/")
        self.assertEqual(response.status_code, 400)

    def test_owner_role_is_not_assignable(self):
        response = self.create_person(role="owner")
        self.assertEqual(response.status_code, 400)

    def test_a_cashier_cannot_reach_staff_admin(self):
        self.create_person()
        cashier = APIClient()
        cashier.post(
            "/api/v1/auth/login/",
            {"username": "cashier.day", "password": "opensesame1"},
            format="json",
        )
        self.assertEqual(cashier.get("/api/v1/staff/").status_code, 403)


class AuditLogTests(StaffTestCase):
    def test_create_writes_a_log_entry(self):
        self.create_person()
        entry = AuditLog.objects.latest("created_at")
        self.assertEqual(entry.action, AuditLog.Action.STAFF_CREATED)
        self.assertEqual(entry.actor_name, "المدير")
        self.assertEqual(entry.target_label, "سمية")

    def test_edit_records_the_field_diff(self):
        pid = self.create_person().data["id"]
        self.client.put(
            f"/api/v1/staff/{pid}/",
            {"display_name": "سمية عبد الله", "role": "kitchen"},
            format="json",
        )
        entry = AuditLog.objects.latest("created_at")
        self.assertEqual(entry.action, AuditLog.Action.STAFF_UPDATED)
        self.assertEqual(entry.metadata["role"], ["cashier", "kitchen"])
        self.assertEqual(entry.metadata["display_name"], ["سمية", "سمية عبد الله"])

    def test_password_reset_is_logged_without_the_value(self):
        pid = self.create_person().data["id"]
        self.client.put(f"/api/v1/staff/{pid}/", {"password": "brandnewpass9"}, format="json")
        entry = AuditLog.objects.latest("created_at")
        self.assertIn("password", entry.metadata)
        self.assertNotIn("brandnewpass9", str(entry.metadata))

    def test_deactivate_and_reactivate_are_distinct_actions(self):
        pid = self.create_person().data["id"]
        self.client.delete(f"/api/v1/staff/{pid}/")
        self.assertEqual(AuditLog.objects.latest("created_at").action, AuditLog.Action.STAFF_DEACTIVATED)
        self.client.put(f"/api/v1/staff/{pid}/", {"is_active": True}, format="json")
        self.assertEqual(AuditLog.objects.latest("created_at").action, AuditLog.Action.STAFF_REACTIVATED)

    def test_a_no_op_edit_writes_nothing(self):
        pid = self.create_person().data["id"]
        before = AuditLog.objects.count()
        self.client.put(f"/api/v1/staff/{pid}/", {"display_name": "سمية"}, format="json")
        self.assertEqual(AuditLog.objects.count(), before)

    def test_log_endpoint_returns_newest_first_and_is_manager_only(self):
        self.create_person()
        self.create_person(username="cashier.night", display_name="عمر")
        response = self.client.get("/api/v1/audit/log/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["target_label"], "عمر")  # newest first

    def test_entries_are_scoped_to_the_managers_branch(self):
        self.create_person()
        other_branch = make_branch(name_ar="فرع آخر")
        other_manager = make_manager(
            branch=other_branch, username="manager2", display_name="مدير الفرع الآخر"
        )
        elsewhere = APIClient()
        elsewhere.post(
            "/api/v1/auth/login/",
            {"username": "manager2", "password": "correct-horse-battery"},
            format="json",
        )
        response = elsewhere.get("/api/v1/audit/log/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 0)  # the other branch's entry is not visible

    def test_log_entries_are_immutable(self):
        self.create_person()
        entry = AuditLog.objects.latest("created_at")
        entry.action = AuditLog.Action.STAFF_DEACTIVATED
        with self.assertRaises(ValueError):
            entry.save()
