"""Batch 12 on the server: what the till learns, and what it can tell.

From the user-experience review:
- The till never heard that the kitchen had finished an order. The pull now
  carries the till's orders that the kitchen has marked ready, as a small
  current-state signal like the waiting deliveries.
- "Unavailable" set on the till stayed on the till, and the website kept
  selling the dish. Availability now travels up as its own sync record, under
  the same branch rules as a price change. A refusal carries a code the till
  can name, not a sentence in a "detail" field.
"""
from __future__ import annotations

import uuid

from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import MenuItem
from apps.orders.models import Order
from tests.factories import envelope, make_device, record
from tests.test_branch_isolation import IsolationTestCase, order_payload


class StatusSignalTestCase(IsolationTestCase):
    def device(self, branch) -> APIClient:
        _, token = make_device(branch)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Device {token}")
        return client

    def push(self, client, record_type, payload):
        response = client.post("/api/v1/sync/push/", envelope(record(record_type, payload)), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["results"][0]


class KitchenReadyTests(StatusSignalTestCase):
    def test_the_pull_carries_the_branchs_ready_orders(self):
        client = self.device(self.a)
        payload = order_payload(status="sent")
        self.assertEqual(self.push(client, "order", payload)["status"], "accepted")
        Order.objects.filter(id=payload["id"]).update(kitchen_status=Order.KitchenStatus.READY)
        # Another branch's ready order is not this till's business.
        Order.objects.filter(id=self.order_b.id).update(kitchen_status=Order.KitchenStatus.READY)

        ready = client.get("/api/v1/sync/pull/").data["kitchen_ready"]
        self.assertEqual([row["id"] for row in ready], [payload["id"]])
        self.assertEqual(ready[0]["number"], Order.objects.get(id=payload["id"]).number)

    def test_served_and_waiting_orders_are_not_ready(self):
        client = self.device(self.a)
        payload = order_payload(status="sent")
        self.push(client, "order", payload)
        for status in [Order.KitchenStatus.QUEUED, Order.KitchenStatus.PREPARING, Order.KitchenStatus.SERVED]:
            Order.objects.filter(id=payload["id"]).update(kitchen_status=status)
            self.assertEqual(client.get("/api/v1/sync/pull/").data["kitchen_ready"], [], status)


class AvailabilityTests(StatusSignalTestCase):
    def change(self, item, is_available):
        return {
            "id": str(uuid.uuid4()),
            "item_id": str(item.id),
            "is_available": is_available,
            "changed_at": timezone.now().isoformat(),
        }

    def test_a_till_marks_its_own_dish_unavailable(self):
        result = self.push(self.device(self.a), "availability", self.change(self.item_a, False))
        self.assertEqual(result["status"], "accepted")
        self.assertFalse(MenuItem.objects.get(id=self.item_a.id).is_available)

    def test_the_same_change_twice_is_a_duplicate(self):
        client = self.device(self.a)
        change = self.change(self.item_a, False)
        self.push(client, "availability", change)
        self.assertEqual(self.push(client, "availability", change)["status"], "duplicate")

    def test_another_branchs_dish_is_refused_by_code(self):
        result = self.push(self.device(self.a), "availability", self.change(self.item_b, False))
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["reason"]["code"], "other_branch")
        self.assertTrue(MenuItem.objects.get(id=self.item_b.id).is_available)

    def test_a_shared_dish_is_the_owners_to_change(self):
        result = self.push(self.device(self.a), "availability", self.change(self.shared_item, False))
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["reason"]["code"], "shared_record")
        self.assertTrue(MenuItem.objects.get(id=self.shared_item.id).is_available)

    def test_a_price_change_for_another_branch_is_refused_by_code_too(self):
        change = {
            "id": str(uuid.uuid4()), "item_id": str(self.item_b.id), "old_price_minor": "12500",
            "new_price_minor": "1", "reason": "manual", "applied_at": timezone.now().isoformat(),
        }
        result = self.push(self.device(self.a), "price_change", change)
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["reason"]["code"], "other_branch")
