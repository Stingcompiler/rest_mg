"""A manager cannot take over or disable the owner's account (batch 42).

The review of 10 October (F01): a branch manager could reset the owner's
password and then change the owner's role to cashier — both answered 200.
Hiding «owner» from the role picker did not protect the owner that exists.
Now only an owner touches an owner's account, and the last active owner
cannot be demoted or deactivated.
"""
from __future__ import annotations

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.audit.models import AuditLog
from tests.factories import make_branch, make_manager

PASSWORD = "correct-horse-battery"


class ManagerAgainstOwnerTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.owner = make_manager(branch=self.branch, username="owner", role=ManagerUser.Role.OWNER)
        self.manager = make_manager(branch=self.branch, username="boss", role=ManagerUser.Role.MANAGER)
        self.cashier = make_manager(branch=self.branch, username="cashier", role=ManagerUser.Role.CASHIER)
        self.client_ = APIClient()
        self.client_.force_authenticate(self.manager)

    def put(self, person, **data):
        return self.client_.put(f"/api/v1/staff/{person.id}/", data, format="json")

    def test_cannot_reset_the_owner_s_password(self):
        response = self.put(self.owner, password="a-new-passphrase-9")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "owner_protected")
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password(PASSWORD))

    def test_cannot_change_the_owner_s_role_name_or_username(self):
        for data in ({"role": "cashier"}, {"display_name": "x"}, {"username": "taken-over"}):
            self.assertEqual(self.put(self.owner, **data).status_code, 403, data)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.role, ManagerUser.Role.OWNER)
        self.assertEqual(self.owner.username, "owner")

    def test_cannot_deactivate_the_owner(self):
        self.assertEqual(self.put(self.owner, is_active=False).status_code, 403)
        self.assertEqual(self.client_.delete(f"/api/v1/staff/{self.owner.id}/").status_code, 403)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_active)

    def test_nothing_about_the_owner_changes_in_the_log(self):
        self.put(self.owner, password="a-new-passphrase-9")
        self.assertFalse(AuditLog.objects.filter(target_id=self.owner.id).exists())

    def test_still_manages_the_staff_it_may(self):
        self.assertEqual(self.put(self.cashier, display_name="سمية").status_code, 200)
        self.assertEqual(self.put(self.cashier, password="a-new-passphrase-9").status_code, 200)


class OwnerTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.owner = make_manager(branch=self.branch, username="owner", role=ManagerUser.Role.OWNER)
        self.client_ = APIClient()
        self.client_.force_authenticate(self.owner)

    def test_the_last_active_owner_cannot_be_demoted(self):
        response = self.client_.put(f"/api/v1/staff/{self.owner.id}/", {"role": "manager"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "last_owner")
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.role, ManagerUser.Role.OWNER)

    def test_an_owner_edits_another_owner(self):
        other = make_manager(branch=self.branch, username="owner2", role=ManagerUser.Role.OWNER)
        response = self.client_.put(f"/api/v1/staff/{other.id}/", {"display_name": "شريك"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_with_a_second_owner_one_may_step_down(self):
        make_manager(branch=self.branch, username="owner2", role=ManagerUser.Role.OWNER)
        response = self.client_.put(f"/api/v1/staff/{self.owner.id}/", {"role": "manager"}, format="json")
        self.assertEqual(response.status_code, 200)
