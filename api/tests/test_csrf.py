"""Writes authenticated by the session cookie need a CSRF token.

The cookie authentication validated the JWT but never ran Django's CSRF check,
so the review's write from a cookie session, with no token and an untrusted
Origin, succeeded (201). ``SameSite=Lax`` keeps most browsers from sending the
cookie on a cross-site POST, but it is not a check the server makes.

Bearer-header and device-token requests are not cookie sessions and keep their
own contract. These tests use ``enforce_csrf_checks=True``; the rest of the
suite runs with Django's test default of not enforcing it.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from tests.factories import envelope, make_branch, make_device, make_manager, order_payload, record

PASSWORD = "correct-horse-battery"


class CsrfTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        make_manager(branch=self.branch, username="manager")
        make_manager(branch=self.branch, username="cashier", role=ManagerUser.Role.CASHIER)

    def signed_in(self, username="manager") -> APIClient:
        client = APIClient(enforce_csrf_checks=True)
        response = client.post(
            "/api/v1/auth/login/", {"username": username, "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        return client

    def new_category(self, client, **extra):
        return client.post(
            "/api/v1/catalog/categories/",
            {"id": str(uuid.uuid4()), "name_ar": "فئة"},
            format="json",
            **extra,
        )

    def test_a_cookie_write_without_a_token_from_another_site_is_refused(self):
        client = self.signed_in()
        response = self.new_category(client, HTTP_ORIGIN="https://untrusted.example")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "csrf_failed")

    def test_a_cookie_write_without_a_token_is_refused(self):
        self.assertEqual(self.new_category(self.signed_in()).status_code, 403)

    def test_signing_in_hands_out_the_csrf_cookie(self):
        client = self.signed_in()
        self.assertTrue(client.cookies["csrftoken"].value)

    def test_reading_the_signed_in_person_hands_out_the_csrf_cookie(self):
        client = self.signed_in()
        del client.cookies["csrftoken"]
        self.assertEqual(client.get("/api/v1/auth/me/").status_code, 200)
        self.assertTrue(client.cookies["csrftoken"].value)

    def test_a_cookie_write_with_the_token_goes_through(self):
        client = self.signed_in()
        token = client.cookies["csrftoken"].value
        self.assertEqual(self.new_category(client, HTTP_X_CSRFTOKEN=token).status_code, 201)

    def test_reads_need_no_token(self):
        self.assertEqual(self.signed_in().get("/api/v1/catalog/categories/").status_code, 200)

    def test_a_bearer_request_needs_no_token(self):
        access = self.signed_in().cookies["sp_access"].value
        client = APIClient(enforce_csrf_checks=True)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(self.new_category(client).status_code, 201)

    def test_a_device_sync_needs_no_token(self):
        _, token = make_device(self.branch)
        client = APIClient(enforce_csrf_checks=True)
        client.credentials(HTTP_AUTHORIZATION=f"Device {token}")
        response = client.post(
            "/api/v1/sync/push/", envelope(record("order", order_payload())), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_a_cashier_cookie_sync_needs_the_token(self):
        client = self.signed_in("cashier")
        body = envelope(record("order", order_payload()))
        self.assertEqual(client.post("/api/v1/sync/push/", body, format="json").status_code, 403)
        token = client.cookies["csrftoken"].value
        response = client.post("/api/v1/sync/push/", body, format="json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200, response.data)
