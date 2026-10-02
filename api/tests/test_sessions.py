"""Sessions end when they should, and stay ended.

The review found that refreshing issued a new token without revoking the old
one, that signing out only deleted cookies, and that changing a password or
deactivating an account left existing tokens usable — reactivation even
revived them. A stolen refresh token could therefore be renewed indefinitely.

Each test signs in through the real endpoints, keeps the tokens it was given,
and then presents those old tokens after the event that should have ended them.
The access token is presented as a Bearer header so its validity is tested on
its own, independently of cookies and CSRF.
"""
from __future__ import annotations

from django.contrib.auth.hashers import make_password
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from tests.factories import make_branch, make_manager

PASSWORD = "correct-horse-battery"


class SessionTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.owner = make_manager(
            branch=self.branch, username="owner", role=ManagerUser.Role.OWNER
        )
        self.cashier = make_manager(
            branch=self.branch, username="cashier", role=ManagerUser.Role.CASHIER
        )

    @staticmethod
    def sign_in(username: str, password: str = PASSWORD):
        client = APIClient()
        response = client.post(
            "/api/v1/auth/login/", {"username": username, "password": password}, format="json"
        )
        assert response.status_code == 200, response.data
        return client, client.cookies["sp_access"].value, client.cookies["sp_refresh"].value

    @staticmethod
    def access_works(access: str) -> bool:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        return client.get("/api/v1/auth/me/").status_code == 200

    @staticmethod
    def refresh_works(refresh: str) -> bool:
        client = APIClient()
        client.cookies["sp_refresh"] = refresh
        return client.post("/api/v1/auth/refresh/").status_code == 200

    def staff_edit(self, person, **changes):
        client = APIClient()
        client.force_authenticate(self.owner)
        response = client.put(f"/api/v1/staff/{person.id}/", changes, format="json")
        self.assertEqual(response.status_code, 200, response.data)


class RefreshAndLogoutTests(SessionTestCase):
    def test_a_refresh_token_is_spent_once_used(self):
        _, _, refresh = self.sign_in("cashier")
        self.assertTrue(self.refresh_works(refresh))
        self.assertFalse(self.refresh_works(refresh))

    def test_the_token_a_refresh_hands_out_works(self):
        client, _, _ = self.sign_in("cashier")
        self.assertEqual(client.post("/api/v1/auth/refresh/").status_code, 200)
        self.assertTrue(self.refresh_works(client.cookies["sp_refresh"].value))

    def test_signing_out_revokes_the_refresh_token(self):
        client, _, refresh = self.sign_in("cashier")
        self.assertEqual(client.post("/api/v1/auth/logout/").status_code, 204)
        self.assertFalse(self.refresh_works(refresh))

    def test_signing_in_works_with_a_dead_access_cookie_still_in_the_browser(self):
        _, access, _ = self.sign_in("cashier")
        self.staff_edit(self.cashier, password="a-brand-new-password")
        client = APIClient()
        client.cookies["sp_access"] = access
        response = client.post(
            "/api/v1/auth/login/",
            {"username": "cashier", "password": "a-brand-new-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)


class EndingEverySessionTests(SessionTestCase):
    def test_a_new_password_ends_every_session(self):
        _, access, refresh = self.sign_in("cashier")
        self.staff_edit(self.cashier, password="a-brand-new-password")
        self.assertFalse(self.access_works(access))
        self.assertFalse(self.refresh_works(refresh))

    def test_deactivation_ends_sessions_and_reactivation_does_not_revive_them(self):
        _, access, refresh = self.sign_in("cashier")
        self.staff_edit(self.cashier, is_active=False)
        self.assertFalse(self.refresh_works(refresh))
        self.staff_edit(self.cashier, is_active=True)
        self.assertFalse(self.access_works(access))
        self.assertFalse(self.refresh_works(refresh))

    def test_signing_out_everywhere_ends_every_session_of_that_person(self):
        client, access, refresh = self.sign_in("owner")
        _, other_access, other_refresh = self.sign_in("owner")

        response = client.post("/api/v1/auth/logout-all/")
        self.assertEqual(response.status_code, 204)
        for token in (access, other_access):
            self.assertFalse(self.access_works(token))
        for token in (refresh, other_refresh):
            self.assertFalse(self.refresh_works(token))
        # Only that person's sessions: the cashier is still signed in.
        _, cashier_access, _ = self.sign_in("cashier")
        self.assertTrue(self.access_works(cashier_access))

    def test_signing_out_everywhere_needs_a_signed_in_person(self):
        self.assertEqual(APIClient().post("/api/v1/auth/logout-all/").status_code, 401)

    def test_a_fresh_sign_in_works_after_signing_out_everywhere(self):
        client, _, _ = self.sign_in("owner")
        client.post("/api/v1/auth/logout-all/")
        _, access, refresh = self.sign_in("owner")
        self.assertTrue(self.access_works(access))
        self.assertTrue(self.refresh_works(refresh))


class PasswordHashUpgradeTests(SessionTestCase):
    @override_settings(
        PASSWORD_HASHERS=[
            "django.contrib.auth.hashers.PBKDF2PasswordHasher",
            "django.contrib.auth.hashers.MD5PasswordHasher",
        ]
    )
    def test_a_sign_in_that_upgrades_the_password_hash_keeps_its_session(self):
        # A Django upgrade raises the hashing cost; the first sign-in after it
        # rewrites the stored hash. That must not end the session it creates.
        ManagerUser.objects.filter(id=self.cashier.id).update(
            password=make_password(PASSWORD, hasher="md5")
        )
        client, access, _ = self.sign_in("cashier")
        self.assertTrue(self.access_works(access))
        self.assertEqual(client.get("/api/v1/auth/me/").status_code, 200)
