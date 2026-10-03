"""Sign-in attempts are rate limited, per account and per address.

There was no limit anywhere: a password could be guessed as fast as requests
could be sent. The limits are not complete protection on their own — they raise
the cost of guessing, alongside revocable sessions and the activity log.

The test settings use a dummy cache so the rest of the suite can sign in freely;
these tests switch to a real one.
"""
from __future__ import annotations

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from tests.factories import make_branch, make_manager

LOCMEM = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


@override_settings(CACHES=LOCMEM)
class LoginThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        make_manager(branch=make_branch(), username="manager")

    def tearDown(self):
        cache.clear()

    def attempt(self, username="manager", password="wrong", address="10.0.0.1"):
        return APIClient().post(
            "/api/v1/auth/login/",
            {"username": username, "password": password},
            format="json",
            REMOTE_ADDR=address,
        )

    def test_guessing_one_account_is_slowed_down(self):
        for _ in range(5):
            self.assertEqual(self.attempt().status_code, 401)
        response = self.attempt()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["error"]["code"], "rate_limited")
        self.assertIn("Retry-After", response)

    def test_the_account_limit_holds_across_addresses(self):
        for index in range(5):
            self.attempt(address=f"10.0.1.{index}")
        self.assertEqual(self.attempt(address="10.0.1.99").status_code, 429)

    def test_the_account_limit_ignores_case_and_spaces(self):
        for _ in range(5):
            self.attempt()
        self.assertEqual(self.attempt(username="  MANAGER ").status_code, 429)

    def test_the_right_password_is_also_refused_while_limited(self):
        for _ in range(5):
            self.attempt()
        self.assertEqual(self.attempt(password="correct-horse-battery").status_code, 429)

    def test_one_address_trying_many_accounts_is_slowed_down(self):
        for index in range(20):
            self.attempt(username=f"guess-{index}")
        self.assertEqual(self.attempt(username="guess-final").status_code, 429)

    def test_another_account_is_not_affected(self):
        make_manager(branch=make_branch(), username="other")
        for _ in range(5):
            self.attempt()
        response = self.attempt(username="other", password="correct-horse-battery",
                                address="10.0.2.1")
        self.assertEqual(response.status_code, 200)
