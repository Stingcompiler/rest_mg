"""Manager surface: cookie auth, device provisioning, catalogue, reports."""
from __future__ import annotations

import uuid

from django.conf import settings
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Device
from apps.catalog.models import MenuItem, PriceChange
from apps.orders.models import Order
from tests.factories import (
    envelope,
    make_branch,
    make_category,
    make_device,
    make_item,
    make_manager,
    order_payload,
    record,
)


class ManagerTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.manager = make_manager(branch=self.branch)
        self.client = APIClient()

    def login(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {"username": "manager", "password": "correct-horse-battery"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        return response


class AuthTests(ManagerTestCase):
    def test_login_sets_httponly_cookies(self):
        response = self.login()
        access = response.cookies[settings.AUTH_COOKIE_ACCESS]
        refresh = response.cookies[settings.AUTH_COOKIE_REFRESH]

        self.assertTrue(access["httponly"])
        self.assertTrue(refresh["httponly"])
        self.assertEqual(access["samesite"], "Lax")
        # The token is never in the body, so no JS can reach it.
        self.assertNotIn("access", response.data)

    def test_bad_credentials_are_refused(self):
        response = self.client.post(
            "/api/v1/auth/login/", {"username": "manager", "password": "wrong"}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_me_reads_the_cookie(self):
        self.login()
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "manager")

    def test_refresh_rotates_the_token(self):
        login = self.login()
        first_refresh = login.cookies[settings.AUTH_COOKIE_REFRESH].value

        response = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.cookies[settings.AUTH_COOKIE_REFRESH].value, first_refresh)

    def test_logout_clears_the_cookies(self):
        self.login()
        self.client.post("/api/v1/auth/logout/")
        self.assertIn(self.client.get("/api/v1/auth/me/").status_code, {401, 403})

    def test_the_manager_surface_is_closed_to_anonymous_callers(self):
        for url in ["/api/v1/catalog/items/", "/api/v1/orders/", "/api/v1/devices/"]:
            with self.subTest(url=url):
                self.assertIn(self.client.get(url).status_code, {401, 403})

    def test_a_device_token_does_not_open_the_manager_surface(self):
        _, token = make_device(branch=self.branch)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Device {token}")
        self.assertIn(client.get("/api/v1/orders/").status_code, {401, 403})


class DeviceEnrolmentTests(ManagerTestCase):
    def test_enrolment_returns_the_token_exactly_once(self):
        self.login()
        response = self.client.post(
            "/api/v1/devices/",
            {"label": "تابلت الكاشير", "branch_id": str(self.branch.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        token = response.data["token"]

        listed = self.client.get("/api/v1/devices/")
        self.assertNotIn("token", listed.data[0])

        # The token works, and only the hash is stored.
        device = Device.objects.get()
        self.assertNotEqual(device.token_hash, token)
        tablet = APIClient()
        tablet.credentials(HTTP_AUTHORIZATION=f"Device {token}")
        self.assertEqual(
            tablet.post("/api/v1/sync/push/", envelope(), format="json").status_code, 200
        )

    def test_revoking_a_device_locks_it_out_immediately(self):
        self.login()
        created = self.client.post(
            "/api/v1/devices/",
            {"label": "تابلت مفقود", "branch_id": str(self.branch.id)},
            format="json",
        )
        token = created.data["token"]
        self.client.post(f"/api/v1/devices/{created.data['id']}/revoke/")

        tablet = APIClient()
        tablet.credentials(HTTP_AUTHORIZATION=f"Device {token}")
        self.assertEqual(
            tablet.post("/api/v1/sync/push/", envelope(), format="json").status_code, 401
        )


class CatalogTests(ManagerTestCase):
    def setUp(self):
        super().setUp()
        self.login()
        self.category = make_category(branch=self.branch)
        self.item = make_item(category=self.category, branch=self.branch, price_minor=12_500)

    def test_creating_an_item_requires_a_client_uuid(self):
        response = self.client.post(
            "/api/v1/catalog/items/",
            {
                "category_id": str(self.category.id),
                "name_ar": "كبدة إسكندراني",
                "price_minor": "15000",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_creating_an_item_stores_money_as_an_integer(self):
        response = self.client.post(
            "/api/v1/catalog/items/",
            {
                "id": str(uuid.uuid4()),
                "category_id": str(self.category.id),
                "name_ar": "كبدة إسكندراني",
                "price_minor": "15000",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["price_minor"], "15000")
        self.assertEqual(MenuItem.objects.get(id=response.data["id"]).price_minor, 15_000)

    def test_a_price_edit_records_the_change(self):
        response = self.client.put(
            f"/api/v1/catalog/items/{self.item.id}/",
            {
                "id": str(self.item.id),
                "category_id": str(self.category.id),
                "name_ar": self.item.name_ar,
                "price_minor": "15000",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        change = PriceChange.objects.get()
        self.assertEqual(change.old_price_minor, 12_500)
        self.assertEqual(change.new_price_minor, 15_000)

    def test_delete_retires_rather_than_removes(self):
        response = self.client.delete(f"/api/v1/catalog/items/{self.item.id}/")
        self.assertEqual(response.status_code, 200)
        self.item.refresh_from_db()
        self.assertFalse(self.item.is_active)
        self.assertTrue(MenuItem.objects.filter(id=self.item.id).exists())

    def test_bulk_percent_change_touches_every_item_and_logs_each(self):
        make_item(category=self.category, branch=self.branch, price_minor=10_000)

        response = self.client.post(
            "/api/v1/catalog/items/bulk-price/",
            {"category_id": str(self.category.id), "percent": 15},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["changed"], 2)
        self.assertEqual(PriceChange.objects.count(), 2)
        self.assertEqual(
            sorted(MenuItem.objects.values_list("price_minor", flat=True)), [11_500, 14_375]
        )


class OrderReadTests(ManagerTestCase):
    def setUp(self):
        super().setUp()
        self.device, self.token = make_device(branch=self.branch)
        tablet = APIClient()
        tablet.credentials(HTTP_AUTHORIZATION=f"Device {self.token}")
        credit = [
            {
                "id": str(uuid.uuid4()),
                "method": "credit",
                "amount_minor": "40000",
                "customer_id": str(uuid.uuid4()),
                "taken_at": timezone.now().isoformat(),
            }
        ]
        tablet.post("/api/v1/sync/push/", envelope(record("order", order_payload(total=25_000))), format="json")
        tablet.post(
            "/api/v1/sync/push/",
            envelope(record("order", order_payload(total=40_000, payments=credit))),
            format="json",
        )
        self.login()

    def test_orders_are_readable(self):
        response = self.client.get("/api/v1/orders/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 2)
        self.assertEqual(response.data["results"][0]["amount_due_minor"], "0")

    def test_orders_cannot_be_edited_through_the_api(self):
        order = Order.objects.first()
        self.assertEqual(
            self.client.put(f"/api/v1/orders/{order.id}/", {}, format="json").status_code, 405
        )
        self.assertEqual(self.client.delete(f"/api/v1/orders/{order.id}/").status_code, 405)

    def test_the_revenue_report_keeps_credit_out_of_collected(self):
        response = self.client.get("/api/v1/reports/revenue/")
        self.assertEqual(response.data["order_count"], 2)
        self.assertEqual(response.data["gross_minor"], "65000")
        self.assertEqual(response.data["collected_minor"], "25000")
        self.assertEqual(response.data["credit_outstanding_minor"], "40000")
