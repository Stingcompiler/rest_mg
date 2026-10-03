"""Branch isolation (review finding F02, implementation plan batch 7).

Lists were mostly scoped to the caller's branch, but fetching or changing one
record went by its id alone: a manager of branch A could read and edit branch
B's menu items, orders, shifts, devices and profile, and a device of branch A
could take over branch B's order through sync.

The rules these tests hold:

- A person or device tied to a branch reaches only that branch's records; a
  record of another branch answers 404, exactly as if it did not exist.
- A person with no branch (the owner over the whole restaurant) reaches all.
- Records with no branch (a menu or profile shared by every branch) are
  visible to all, but only someone with no branch may change them.
- Sync never moves a record from one branch to another.
- The public order endpoint orders from a named restaurant when more than one
  is published.
"""
from __future__ import annotations

import io
import uuid

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Device, ManagerUser
from apps.catalog.models import Category, MenuItem
from apps.orders.models import Order
from apps.profiles.models import RestaurantProfile
from apps.shifts.models import Shift
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


def a_png() -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), "red").save(buffer, format="PNG")
    return SimpleUploadedFile("dish.png", buffer.getvalue(), content_type="image/png")


class IsolationTestCase(TestCase):
    def setUp(self):
        self.a = make_branch(name_ar="فرع أ")
        self.b = make_branch(name_ar="فرع ب")
        self.manager_a = make_manager(branch=self.a, username="manager.a")
        self.owner = make_manager(branch=None, username="owner", role=ManagerUser.Role.OWNER)
        self.cat_a = make_category(branch=self.a, name_ar="فئة أ")
        self.cat_b = make_category(branch=self.b, name_ar="فئة ب")
        self.item_a = make_item(branch=self.a, category=self.cat_a, name_ar="صنف أ")
        self.item_b = make_item(branch=self.b, category=self.cat_b, name_ar="صنف ب")
        self.shared_cat = make_category(branch=None, name_ar="فئة مشتركة")
        self.shared_item = make_item(branch=None, category=self.shared_cat, name_ar="صنف مشترك")
        now = timezone.now()
        self.order_b = Order.objects.create(
            id=uuid.uuid4(), branch=self.b, number="B-1", status="sent", type="dine_in",
            opened_at=now, sent_at=now, created_at=now, updated_at=now,
        )
        self.online_b = Order.objects.create(
            id=uuid.uuid4(), branch=self.b, number="2001", status="sent", type="delivery",
            channel="online", delivery_status="confirmed", total_minor=12_500, subtotal_minor=12_500,
            opened_at=now, sent_at=now, created_at=now, updated_at=now,
        )
        self.shift_b = Shift.objects.create(
            id=uuid.uuid4(), branch=self.b, status="closed", opened_at=now, closed_at=now,
            expected_cash_minor=0, counted_cash_minor=0, variance_minor=0,
            created_at=now, updated_at=now,
        )
        self.device_b, _ = make_device(self.b)
        self.profile_b = RestaurantProfile.objects.create(
            id=uuid.uuid4(), branch=self.b, slug="branch-b", name_ar="مطعم ب",
            landing_page_enabled=True, online_ordering_enabled=True, created_at=now, updated_at=now,
        )

    def as_user(self, user) -> APIClient:
        client = APIClient()
        client.force_authenticate(user)
        return client

    def as_role(self, branch, role, username) -> APIClient:
        return self.as_user(make_manager(branch=branch, username=username, role=role))


class CatalogIsolationTests(IsolationTestCase):
    def ids(self, response):
        return {row["id"] for row in response.data}

    def test_lists_show_own_and_shared_records_only(self):
        client = self.as_user(self.manager_a)
        items = self.ids(client.get("/api/v1/catalog/items/"))
        self.assertIn(str(self.item_a.id), items)
        self.assertIn(str(self.shared_item.id), items)
        self.assertNotIn(str(self.item_b.id), items)
        categories = self.ids(client.get("/api/v1/catalog/categories/"))
        self.assertNotIn(str(self.cat_b.id), categories)
        self.assertIn(str(self.shared_cat.id), categories)

    def test_the_owner_sees_every_branch(self):
        items = self.ids(self.as_user(self.owner).get("/api/v1/catalog/items/"))
        self.assertTrue({str(self.item_a.id), str(self.item_b.id)} <= items)

    def test_another_branchs_item_is_not_found_for_any_action(self):
        client = self.as_user(self.manager_a)
        url = f"/api/v1/catalog/items/{self.item_b.id}/"
        self.assertEqual(client.get(url).status_code, 404)
        self.assertEqual(client.put(url, {"price_minor": "1"}, format="json").status_code, 404)
        self.assertEqual(client.delete(url).status_code, 404)
        image = client.post(f"{url}image/", {"image": a_png()}, format="multipart")
        self.assertEqual(image.status_code, 404)
        self.item_b.refresh_from_db()
        self.assertEqual(self.item_b.price_minor, 12_500)
        self.assertTrue(self.item_b.is_active)
        self.assertFalse(self.item_b.image)

    def test_another_branchs_category_is_not_found_for_any_action(self):
        client = self.as_user(self.manager_a)
        url = f"/api/v1/catalog/categories/{self.cat_b.id}/"
        self.assertEqual(client.get(url).status_code, 404)
        self.assertEqual(client.put(url, {"name_ar": "x"}, format="json").status_code, 404)
        self.assertEqual(client.delete(url).status_code, 404)
        self.cat_b.refresh_from_db()
        self.assertEqual(self.cat_b.name_ar, "فئة ب")
        self.assertTrue(self.cat_b.is_active)

    def test_an_item_cannot_be_created_in_another_branchs_category(self):
        response = self.as_user(self.manager_a).post(
            "/api/v1/catalog/items/",
            {"id": str(uuid.uuid4()), "category_id": str(self.cat_b.id), "name_ar": "دخيل", "price_minor": "100"},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)

    def test_a_bulk_price_change_touches_only_the_callers_branch(self):
        response = self.as_user(self.manager_a).post(
            "/api/v1/catalog/items/bulk-price/", {"percent": "10"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.item_a.refresh_from_db()
        self.item_b.refresh_from_db()
        self.shared_item.refresh_from_db()
        self.assertEqual(self.item_a.price_minor, 13_750)
        self.assertEqual(self.item_b.price_minor, 12_500)
        self.assertEqual(self.shared_item.price_minor, 12_500)

    def test_a_bulk_price_change_on_another_branchs_category_is_refused(self):
        response = self.as_user(self.manager_a).post(
            "/api/v1/catalog/items/bulk-price/", {"percent": "10", "category_id": str(self.cat_b.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.item_b.refresh_from_db()
        self.assertEqual(self.item_b.price_minor, 12_500)

    def test_a_shared_item_is_readable_but_only_the_owner_changes_it(self):
        url = f"/api/v1/catalog/items/{self.shared_item.id}/"
        branch_manager = self.as_user(self.manager_a)
        self.assertEqual(branch_manager.get(url).status_code, 200)
        refused = branch_manager.delete(url)
        self.assertEqual(refused.status_code, 403)
        self.assertEqual(refused.data["error"]["code"], "shared_record")
        self.assertEqual(self.as_user(self.owner).delete(url).status_code, 200)


class OrderIsolationTests(IsolationTestCase):
    def test_another_branchs_order_is_not_found(self):
        response = self.as_user(self.manager_a).get(f"/api/v1/orders/{self.order_b.id}/")
        self.assertEqual(response.status_code, 404)

    def test_another_branchs_delivery_cannot_be_moved(self):
        cashier_a = self.as_role(self.a, ManagerUser.Role.CASHIER, "cashier.a")
        response = cashier_a.post(
            f"/api/v1/orders/{self.online_b.id}/delivery-status/", {"delivery_status": "cancelled"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.online_b.refresh_from_db()
        self.assertEqual(self.online_b.delivery_status, "confirmed")

    def test_another_branchs_kitchen_ticket_cannot_be_advanced(self):
        kitchen_a = self.as_role(self.a, ManagerUser.Role.KITCHEN, "kitchen.a")
        response = kitchen_a.post(
            f"/api/v1/kitchen/tickets/{self.order_b.id}/status/", {"kitchen_status": "ready"}, format="json"
        )
        self.assertEqual(response.status_code, 404)
        self.order_b.refresh_from_db()
        self.assertEqual(self.order_b.kitchen_status, "queued")

    def test_another_branchs_shift_is_not_found(self):
        response = self.as_user(self.manager_a).get(f"/api/v1/shifts/{self.shift_b.id}/")
        self.assertEqual(response.status_code, 404)


class DeviceAndProfileIsolationTests(IsolationTestCase):
    def test_another_branchs_device_cannot_be_revoked(self):
        response = self.as_user(self.manager_a).post(f"/api/v1/devices/{self.device_b.id}/revoke/")
        self.assertEqual(response.status_code, 404)
        self.assertIsNone(Device.objects.get(id=self.device_b.id).revoked_at)

    def test_a_device_cannot_be_enrolled_for_another_branch(self):
        response = self.as_user(self.manager_a).post(
            "/api/v1/devices/", {"label": "دخيل", "branch_id": str(self.b.id)}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Device.objects.filter(branch=self.b).count(), 1)

    def test_another_branchs_profile_is_not_found_for_any_action(self):
        client = self.as_user(self.manager_a)
        url = f"/api/v1/profile/{self.profile_b.id}/"
        self.assertEqual(client.get(url).status_code, 404)
        updated = client.put(url, {"id": str(self.profile_b.id), "slug": "x", "name_ar": "x"}, format="json")
        self.assertEqual(updated.status_code, 404)
        branding = client.post(f"{url}branding/", {"logo": a_png()}, format="multipart")
        self.assertEqual(branding.status_code, 404)
        self.profile_b.refresh_from_db()
        self.assertEqual(self.profile_b.name_ar, "مطعم ب")


class SyncIsolationTests(IsolationTestCase):
    def device_a(self) -> APIClient:
        _, token = make_device(self.a)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Device {token}")
        return client

    def push(self, client, record_type, payload):
        response = client.post("/api/v1/sync/push/", envelope(record(record_type, payload)), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["results"][0]

    def test_a_device_cannot_take_over_another_branchs_order(self):
        payload = order_payload(order_id=self.order_b.id, status="closed")
        result = self.push(self.device_a(), "order", payload)
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["reason"]["code"], "other_branch")
        self.order_b.refresh_from_db()
        self.assertEqual(self.order_b.branch_id, self.b.id)
        self.assertEqual(self.order_b.status, "sent")

    def test_a_device_cannot_collect_another_branchs_website_order(self):
        payload = order_payload(order_id=self.online_b.id, total=12_500, status="closed")
        result = self.push(self.device_a(), "order", payload)
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["reason"]["code"], "other_branch")
        self.assertEqual(Order.objects.get(id=self.online_b.id).status, "sent")

    def test_a_device_cannot_change_another_branchs_price(self):
        now = timezone.now().isoformat()
        change = {
            "id": str(uuid.uuid4()), "item_id": str(self.item_b.id), "old_price_minor": "12500",
            "new_price_minor": "1", "reason": "manual", "applied_at": now,
        }
        result = self.push(self.device_a(), "price_change", change)
        self.assertEqual(result["status"], "rejected")
        self.item_b.refresh_from_db()
        self.assertEqual(self.item_b.price_minor, 12_500)

    def test_an_order_is_not_linked_to_another_branchs_shift(self):
        payload = order_payload(shift_ref=self.shift_b.id)
        self.assertEqual(self.push(self.device_a(), "order", payload)["status"], "accepted")
        self.assertIsNone(Order.objects.get(id=payload["id"]).shift_id)


class PublicOrderIsolationTests(IsolationTestCase):
    def setUp(self):
        super().setUp()
        now = timezone.now()
        self.profile_a = RestaurantProfile.objects.create(
            id=uuid.uuid4(), branch=self.a, slug="branch-a", name_ar="مطعم أ",
            landing_page_enabled=True, online_ordering_enabled=True, created_at=now, updated_at=now,
        )

    def order(self, item, slug=None):
        body = {
            "customer_name": "أحمد", "customer_phone": "0912345678", "customer_address": "شارع النيل",
            "items": [{"item_id": str(item.id), "qty": 1}],
        }
        if slug:
            body["slug"] = slug
        return APIClient().post("/api/v1/public/order/", body, format="json")

    def test_with_two_restaurants_published_the_order_must_name_one(self):
        response = self.order(self.item_a)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "restaurant_required")

    def test_the_order_goes_to_the_named_restaurants_branch(self):
        response = self.order(self.item_a, slug="branch-a")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Order.objects.get(id=response.data["id"]).branch_id, self.a.id)

    def test_the_page_tells_the_order_form_which_restaurant_it_is(self):
        page = APIClient().get("/api/v1/public/branch-a/").data
        self.assertEqual(page["slug"], "branch-a")

    def test_another_restaurants_item_cannot_be_ordered(self):
        response = self.order(self.item_b, slug="branch-a")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "item_unavailable")


class StaffBranchTests(IsolationTestCase):
    def new_cashier(self, client, **extra):
        body = {"username": f"c.{uuid.uuid4().hex[:6]}", "role": "cashier", "password": "a-long-password", **extra}
        return client.post("/api/v1/staff/", body, format="json")

    def test_the_owner_places_new_staff_in_a_branch(self):
        response = self.new_cashier(self.as_user(self.owner), branch_id=str(self.b.id))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ManagerUser.objects.get(id=response.data["id"]).branch_id, self.b.id)

    def test_a_branch_manager_cannot_place_staff_in_another_branch(self):
        response = self.new_cashier(self.as_user(self.manager_a), branch_id=str(self.b.id))
        self.assertEqual(response.status_code, 400)

    def test_a_branch_managers_new_staff_join_that_branch(self):
        response = self.new_cashier(self.as_user(self.manager_a))
        self.assertEqual(ManagerUser.objects.get(id=response.data["id"]).branch_id, self.a.id)
