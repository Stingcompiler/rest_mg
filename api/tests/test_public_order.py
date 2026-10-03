"""The public delivery-order flow and the widened catalogue permissions.

These pin the two things §17 of the brief insists on: pricing is the server's,
and permissions are enforced on the server, not merely hidden in the UI.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.catalog.models import Category, MenuItem
from apps.orders.models import Order
from apps.profiles.models import RestaurantProfile
from tests.factories import make_branch, make_manager


def make_item(branch, category, **over):
    now = timezone.now()
    defaults = dict(
        id=uuid.uuid4(),
        branch=branch,
        category=category,
        name_ar="شاورما",
        price_minor=12500,
        is_available=True,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    defaults.update(over)
    return MenuItem.objects.create(**defaults)


class PublicOrderTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch()
        now = timezone.now()
        self.profile = RestaurantProfile.objects.create(
            id=uuid.uuid4(),
            branch=self.branch,
            slug="mataam",
            name_ar="مطعم",
            landing_page_enabled=True,
            online_ordering_enabled=True,
            created_at=now,
            updated_at=now,
        )
        self.category = Category.objects.create(
            id=uuid.uuid4(), branch=self.branch, name_ar="وجبات",
            created_at=now, updated_at=now,
        )
        self.item = make_item(self.branch, self.category, price_minor=12500)
        self.client = APIClient()

    def order_body(self, **over):
        body = {
            "customer_name": "أحمد",
            "customer_phone": "0912345678",
            "customer_address": "شارع النيل، بيت ٥",
            "customer_area": "الخرطوم",
            "items": [{"item_id": str(self.item.id), "qty": 2}],
        }
        body.update(over)
        return body


class PublicOrderTests(PublicOrderTestCase):
    def test_places_a_delivery_order(self):
        response = self.client.post("/api/v1/public/order/", self.order_body(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["item_count"], 2)
        # 2 × 12500, priced by the server.
        self.assertEqual(response.data["total_minor"], "25000")
        self.assertEqual(response.data["delivery_status"], "pending")

    def test_price_comes_from_the_server_not_the_client(self):
        # The client tries to smuggle a price; it must be ignored.
        body = self.order_body()
        body["items"][0]["price_minor"] = "1"
        body["total_minor"] = "1"
        response = self.client.post("/api/v1/public/order/", body, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["total_minor"], "25000")

    def test_the_order_reaches_the_pos_and_kitchen(self):
        self.client.post("/api/v1/public/order/", self.order_body(), format="json")
        order = Order.objects.get(channel=Order.Channel.ONLINE)
        self.assertEqual(order.type, Order.Type.DELIVERY)
        self.assertEqual(order.status, Order.Status.SENT)  # visible on the order list
        self.assertEqual(order.kitchen_status, Order.KitchenStatus.QUEUED)  # on the board
        self.assertEqual(order.customer_name, "أحمد")
        self.assertEqual(order.lines.count(), 1)

    def test_an_unavailable_item_cannot_be_ordered(self):
        self.item.is_available = False
        self.item.save(update_fields=["is_available"])
        response = self.client.post("/api/v1/public/order/", self.order_body(), format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Order.objects.filter(channel=Order.Channel.ONLINE).count(), 0)

    def test_an_item_under_a_retired_category_cannot_be_ordered(self):
        # It is not on the public menu once its category is retired, so it must
        # not be orderable either — a stale cart must not buy a withdrawn item.
        self.category.is_active = False
        self.category.save(update_fields=["is_active"])
        response = self.client.post("/api/v1/public/order/", self.order_body(), format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Order.objects.filter(channel=Order.Channel.ONLINE).count(), 0)

    def test_an_unknown_item_is_refused(self):
        body = self.order_body(items=[{"item_id": str(uuid.uuid4()), "qty": 1}])
        response = self.client.post("/api/v1/public/order/", body, format="json")
        self.assertEqual(response.status_code, 409)

    def test_an_empty_cart_is_rejected(self):
        body = self.order_body(items=[])
        response = self.client.post("/api/v1/public/order/", body, format="json")
        self.assertEqual(response.status_code, 400)

    def test_ordering_is_closed_when_the_page_is_unpublished(self):
        self.profile.landing_page_enabled = False
        self.profile.save(update_fields=["landing_page_enabled"])
        response = self.client.post("/api/v1/public/order/", self.order_body(), format="json")
        self.assertEqual(response.status_code, 404)

    def test_no_auth_required(self):
        # A brand-new client with no cookies can still order.
        response = APIClient().post("/api/v1/public/order/", self.order_body(), format="json")
        self.assertEqual(response.status_code, 201)


class CatalogPermissionTests(PublicOrderTestCase):
    def _login(self, username, role):
        make_manager(branch=self.branch, username=username, role=role, password="pw-catalog-1234")
        client = APIClient()
        client.post(
            "/api/v1/auth/login/",
            {"username": username, "password": "pw-catalog-1234"},
            format="json",
        )
        return client

    def _new_item_body(self):
        return {
            "id": str(uuid.uuid4()),
            "category_id": str(self.category.id),
            "name_ar": "طبق جديد",
            "price_minor": "9000",
        }

    def test_cashier_can_manage_the_catalogue(self):
        cashier = self._login("cashier.cat", ManagerUser.Role.CASHIER)
        created = cashier.post("/api/v1/catalog/items/", self._new_item_body(), format="json")
        self.assertEqual(created.status_code, 201)

    def test_manager_can_manage_the_catalogue(self):
        manager = self._login("manager.cat", ManagerUser.Role.MANAGER)
        created = manager.post("/api/v1/catalog/items/", self._new_item_body(), format="json")
        self.assertEqual(created.status_code, 201)

    def test_kitchen_cannot_manage_the_catalogue(self):
        kitchen = self._login("kitchen.cat", ManagerUser.Role.KITCHEN)
        created = kitchen.post("/api/v1/catalog/items/", self._new_item_body(), format="json")
        self.assertEqual(created.status_code, 403)

    def test_is_featured_round_trips(self):
        manager = self._login("manager.feat", ManagerUser.Role.MANAGER)
        body = self._new_item_body()
        body["is_featured"] = True
        created = manager.post("/api/v1/catalog/items/", body, format="json")
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.data["is_featured"])
        self.assertIn("image_url", created.data)
        self.assertIsNone(created.data["image_url"])

    def test_featured_item_appears_on_the_public_page(self):
        make_item(self.branch, self.category, name_ar="الأكثر طلبًا", is_featured=True)
        response = self.client.get("/api/v1/public/")
        self.assertEqual(response.status_code, 200)
        featured_names = [i["name_ar"] for i in response.data["featured"]]
        self.assertIn("الأكثر طلبًا", featured_names)
