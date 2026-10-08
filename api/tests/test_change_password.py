"""Changing your own password (batch 34).

After the first deployment the manager had no way to change the password the
server was provisioned with. The staff screen could reset a password, but with
no check that the person typing knew the current one, and editing your own row
ended your own session mid-edit. Now:

  - Anyone signed in changes their own password at POST /auth/password/, giving
    the current one. A wrong current password is refused and counted like a
    failed sign-in.
  - The new one passes the same rules as everywhere (length, not a common one)
    and must differ from the current one.
  - Every other session ends (a password that may have leaked must not keep a
    stolen session alive); this device stays signed in.
  - The staff screen no longer sets your own password: that path skipped the
    current-password check.
"""
from __future__ import annotations

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.audit.models import AuditLog
from tests.factories import make_branch, make_manager
from tests.test_sessions import PASSWORD, SessionTestCase

# The test settings use a cache that keeps nothing; the limits need a real one.
LOCMEM = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "change-password"}}
NEW_PASSWORD = "a-much-better-passphrase"
URL = "/api/v1/auth/password/"


@override_settings(CACHES=LOCMEM)
class ChangeOwnPasswordTests(SessionTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.manager = make_manager(branch=self.branch, username="boss", role=ManagerUser.Role.MANAGER)

    def change(self, client, current=PASSWORD, new=NEW_PASSWORD):
        return client.post(URL, {"current_password": current, "new_password": new}, format="json")

    def test_the_manager_changes_their_password_and_signs_in_with_it(self):
        client, _, _ = self.sign_in("boss")
        self.assertEqual(self.change(client).status_code, 200)
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.check_password(NEW_PASSWORD))
        self.assertFalse(self.manager.check_password(PASSWORD))
        self.sign_in("boss", NEW_PASSWORD)

    def test_every_staff_role_can_change_their_own(self):
        client, _, _ = self.sign_in("cashier")
        self.assertEqual(self.change(client).status_code, 200)

    def test_this_device_stays_signed_in(self):
        client, _, _ = self.sign_in("boss")
        response = self.change(client)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "boss")
        self.assertTrue(self.access_works(client.cookies["sp_access"].value))
        self.assertTrue(self.refresh_works(client.cookies["sp_refresh"].value))

    def test_every_other_session_ends(self):
        other, other_access, other_refresh = self.sign_in("boss")
        client, _, _ = self.sign_in("boss")
        self.assertEqual(self.change(client).status_code, 200)
        self.assertFalse(self.access_works(other_access))
        self.assertFalse(self.refresh_works(other_refresh))

    def test_a_wrong_current_password_is_refused_and_changes_nothing(self):
        client, access, _ = self.sign_in("boss")
        response = self.change(client, current="not-the-password")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "wrong_password")
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.check_password(PASSWORD))
        self.assertTrue(self.access_works(access))

    def test_guessing_the_current_password_is_limited_like_signing_in(self):
        client, _, _ = self.sign_in("boss")
        codes = [self.change(client, current=f"guess-{n}").status_code for n in range(12)]
        self.assertIn(429, codes)

    def test_a_weak_new_password_is_refused(self):
        client, _, _ = self.sign_in("boss")
        for weak in ["short", "password123"]:
            response = self.change(client, new=weak)
            self.assertEqual(response.status_code, 400, weak)
            self.assertEqual(response.data["error"]["code"], "weak_password", weak)
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.check_password(PASSWORD))

    def test_the_new_password_must_differ_from_the_current_one(self):
        client, _, _ = self.sign_in("boss")
        response = self.change(client, new=PASSWORD)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "same_password")

    def test_signing_out_is_needed_to_reach_it(self):
        self.assertIn(APIClient().post(URL, {"current_password": PASSWORD, "new_password": NEW_PASSWORD}, format="json").status_code, (401, 403))

    def test_the_change_is_in_the_activity_log_without_the_password(self):
        client, _, _ = self.sign_in("boss")
        self.change(client)
        entry = AuditLog.objects.filter(action=AuditLog.Action.STAFF_UPDATED, target_id=self.manager.id).latest("created_at")
        self.assertEqual(entry.actor_id, self.manager.id)
        self.assertEqual(entry.metadata, {"password": ["changed", None]})
        self.assertNotIn(NEW_PASSWORD, str(entry.metadata))


class StaffScreenOwnPasswordTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.manager = make_manager(branch=self.branch, username="boss", role=ManagerUser.Role.MANAGER)
        self.cashier = make_manager(branch=self.branch, username="cashier", role=ManagerUser.Role.CASHIER)
        self.client_ = APIClient()
        self.client_.force_authenticate(self.manager)

    def test_does_not_set_your_own_password(self):
        # It would skip the current-password check, and end your own session.
        response = self.client_.put(f"/api/v1/staff/{self.manager.id}/", {"password": NEW_PASSWORD}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "use_change_password")
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.check_password(PASSWORD))

    def test_still_resets_someone_else_s(self):
        response = self.client_.put(f"/api/v1/staff/{self.cashier.id}/", {"password": NEW_PASSWORD}, format="json")
        self.assertEqual(response.status_code, 200)
        self.cashier.refresh_from_db()
        self.assertTrue(self.cashier.check_password(NEW_PASSWORD))

    def test_still_edits_your_own_name(self):
        response = self.client_.put(f"/api/v1/staff/{self.manager.id}/", {"display_name": "المدير"}, format="json")
        self.assertEqual(response.status_code, 200)
