"""Branch isolation (review finding F02) — known gaps, deferred on purpose.

Until a second branch is added, ``SINGLE_BRANCH`` refuses to create one
(tests/test_single_branch.py), so these gaps cannot be reached in a deployment.
They are kept here as expected failures so they stay visible and so fixing them
is noticed: an expected failure that starts passing is reported as an
"unexpected success", which fails the run until the decorator is removed.

Each test asserts the specific isolation behaviour — an expected failure passes
on any failure, so a test that broke for another reason would hide the gap.
"""
from __future__ import annotations

import io
import unittest
import uuid

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

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


class BranchIsolationGaps(TestCase):
    def setUp(self):
        self.branch_a = make_branch(name_ar="فرع أ")
        self.branch_b = make_branch(name_ar="فرع ب")
        self.client = APIClient()
        self.client.force_authenticate(make_manager(branch=self.branch_a))
        self.item_b = make_item(branch=self.branch_b, category=make_category(branch=self.branch_b))

    @unittest.expectedFailure
    def test_the_item_list_shows_only_the_managers_branch(self):
        ids = [row["id"] for row in self.client.get("/api/v1/catalog/items/").data]
        self.assertNotIn(str(self.item_b.id), ids)

    @unittest.expectedFailure
    def test_another_branchs_order_is_not_found(self):
        order = Order.objects.create(
            id=uuid.uuid4(), branch=self.branch_b, number="B-1",
            opened_at=timezone.now(), status="sent", type="dine_in",
        )
        self.assertEqual(self.client.get(f"/api/v1/orders/{order.id}/").status_code, 404)

    @unittest.expectedFailure
    def test_a_device_cannot_take_over_another_branchs_order(self):
        _, token_b = make_device(self.branch_b)
        _, token_a = make_device(self.branch_a)
        payload = order_payload(status="sent")
        device_b = APIClient()
        device_b.credentials(HTTP_AUTHORIZATION=f"Device {token_b}")
        device_b.post("/api/v1/sync/push/", envelope(record("order", payload)), format="json")

        payload["status"] = "closed"
        device_a = APIClient()
        device_a.credentials(HTTP_AUTHORIZATION=f"Device {token_a}")
        device_a.post("/api/v1/sync/push/", envelope(record("order", payload)), format="json")
        self.assertEqual(Order.objects.get(id=payload["id"]).branch_id, self.branch_b.id)

    @unittest.expectedFailure
    def test_a_photo_cannot_be_uploaded_to_another_branchs_item(self):
        buffer = io.BytesIO()
        Image.new("RGB", (4, 4), "red").save(buffer, format="PNG")
        photo = SimpleUploadedFile("dish.png", buffer.getvalue(), content_type="image/png")
        response = self.client.post(
            f"/api/v1/catalog/items/{self.item_b.id}/image/", {"image": photo}, format="multipart"
        )
        self.assertEqual(response.status_code, 404)
