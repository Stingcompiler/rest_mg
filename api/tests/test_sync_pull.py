"""The pull contract: deltas by the server's clock, never the device's."""
from __future__ import annotations

import time
import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import MenuItem, PriceChange
from apps.orders.models import Order
from tests.factories import (
    envelope,
    make_branch,
    make_category,
    make_device,
    make_item,
    record,
)

PULL = "/api/v1/sync/pull/"


def _tick() -> None:
    """Advance past the system clock's granularity.

    The pull cursor is `timezone.now()` taken inside the view, and a save sets
    `server_updated_at` the same way. On Windows the clock can report the same
    instant for both, and the cursor filter is strictly greater-than, so a row
    saved in the same tick as the cursor would look unchanged. Real traffic
    never edits a row in the same microsecond it polls; this keeps the test
    about the behaviour it names rather than about clock resolution.
    """
    time.sleep(0.01)


PUSH = "/api/v1/sync/push/"


class PullTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.device, self.token = make_device(branch=self.branch)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Device {self.token}")
        self.category = make_category(branch=self.branch)
        self.item = make_item(category=self.category, branch=self.branch)

    def test_no_cursor_returns_a_full_snapshot(self):
        response = self.client.get(PULL)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["full_snapshot"])
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["price_minor"], "12500")

    def test_a_cursor_returns_only_what_changed(self):
        cursor = self.client.get(PULL).data["cursor"]

        quiet = self.client.get(PULL, {"since": cursor.isoformat()})
        self.assertEqual(quiet.data["items"], [])
        self.assertEqual(quiet.data["categories"], [])
        self.assertFalse(quiet.data["full_snapshot"])

        _tick()
        self.item.price_minor = 15_000
        self.item.updated_at = timezone.now()
        self.item.save()

        delta = self.client.get(PULL, {"since": cursor.isoformat()})
        self.assertEqual(len(delta.data["items"]), 1)
        self.assertEqual(delta.data["items"][0]["price_minor"], "15000")

    def test_a_stale_device_clock_does_not_hide_rows(self):
        """The row's device timestamp is old; its server timestamp is not."""
        cursor = self.client.get(PULL).data["cursor"]
        _tick()
        self.item.price_minor = 15_000
        self.item.updated_at = timezone.now() - timezone.timedelta(days=30)
        self.item.save()

        delta = self.client.get(PULL, {"since": cursor.isoformat()})
        self.assertEqual(len(delta.data["items"]), 1)

    def test_another_branch_is_not_visible(self):
        other = make_branch(name_ar="فرع بحري")
        make_item(category=make_category(branch=other), branch=other)

        response = self.client.get(PULL)
        self.assertEqual(len(response.data["items"]), 1)


class PriceChangePushTests(TestCase):
    """Cashier price edits travel up in the same envelope as orders."""

    def setUp(self):
        self.branch = make_branch()
        self.device, self.token = make_device(branch=self.branch)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Device {self.token}")
        self.item = make_item(branch=self.branch, price_minor=12_500)

    def _change(self, *, new_price: int, applied_at=None, change_id=None) -> dict:
        applied_at = applied_at or timezone.now()
        return {
            "id": str(change_id or uuid.uuid4()),
            "item_id": str(self.item.id),
            "old_price_minor": str(self.item.price_minor),
            "new_price_minor": str(new_price),
            "reason": "manual",
            "applied_at": applied_at.isoformat(),
        }

    def test_a_price_edit_moves_the_item_and_leaves_a_trail(self):
        response = self.client.post(
            PUSH, envelope(record("price_change", self._change(new_price=15_000))), format="json"
        )
        self.assertEqual(response.data["accepted"], 1)

        self.item.refresh_from_db()
        self.assertEqual(self.item.price_minor, 15_000)
        self.assertEqual(PriceChange.objects.count(), 1)

    def test_a_stale_edit_is_recorded_but_does_not_move_the_price_back(self):
        self.client.post(
            PUSH, envelope(record("price_change", self._change(new_price=15_000))), format="json"
        )
        self.item.refresh_from_db()

        stale = self._change(
            new_price=9_000, applied_at=timezone.now() - timezone.timedelta(hours=6)
        )
        self.client.post(PUSH, envelope(record("price_change", stale)), format="json")

        self.item.refresh_from_db()
        self.assertEqual(self.item.price_minor, 15_000)
        self.assertEqual(PriceChange.objects.count(), 2)

    def test_an_edit_for_an_unknown_item_is_rejected_not_swallowed(self):
        payload = self._change(new_price=15_000)
        payload["item_id"] = str(uuid.uuid4())
        response = self.client.post(PUSH, envelope(record("price_change", payload)), format="json")
        self.assertEqual(response.data["results"][0]["status"], "rejected")
        self.assertEqual(MenuItem.objects.get().price_minor, 12_500)


class PendingDeliverySignalTests(TestCase):
    """The till has to be able to say "somebody is waiting" without fetching an
    order. Orders travel up from the till, never down; this is a signal, and
    these tests hold it to being exactly that."""

    def setUp(self):
        self.branch = make_branch()
        self.device, self.token = make_device(branch=self.branch)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Device {self.token}")

    def _order(self, *, number, delivery_status, channel=Order.Channel.ONLINE):
        now = timezone.now()
        return Order.objects.create(
            id=uuid.uuid4(), branch=self.branch, number=number,
            type=Order.Type.DELIVERY, status=Order.Status.SENT, channel=channel,
            delivery_status=delivery_status,
            opened_at=now, created_at=now, updated_at=now,
        )

    def test_a_waiting_customer_order_reaches_the_till(self):
        self._order(number="6001", delivery_status=Order.DeliveryStatus.PENDING)
        body = self.client.get(PULL).data
        self.assertEqual([row["number"] for row in body["pending_deliveries"]], ["6001"])

    def test_a_confirmed_order_is_no_longer_waiting(self):
        # The badge counts what still needs somebody, not everything that exists.
        self._order(number="6002", delivery_status=Order.DeliveryStatus.CONFIRMED)
        body = self.client.get(PULL).data
        self.assertEqual(body["pending_deliveries"], [])

    def test_a_till_order_is_not_a_customer_order(self):
        self._order(number="6003", delivery_status=Order.DeliveryStatus.PENDING,
                    channel=Order.Channel.POS)
        body = self.client.get(PULL).data
        self.assertEqual(body["pending_deliveries"], [])

    def test_the_signal_carries_no_order_detail(self):
        # If this ever grows a customer name or a total, orders have started
        # travelling downward and the offline-first contract has been broken.
        self._order(number="6004", delivery_status=Order.DeliveryStatus.PENDING)
        row = self.client.get(PULL).data["pending_deliveries"][0]
        self.assertEqual(set(row), {"id", "number"})

    def test_it_is_current_state_not_a_delta(self):
        # A badge must be right on every run. Sent only on the poll where it
        # changed, a till that missed one would show nothing at all.
        self._order(number="6005", delivery_status=Order.DeliveryStatus.PENDING)
        cursor = self.client.get(PULL).data["cursor"]
        _tick()
        again = self.client.get(PULL, {"since": cursor.isoformat()}).data
        self.assertEqual(again["items"], [])  # nothing else changed
        self.assertEqual([row["number"] for row in again["pending_deliveries"]], ["6005"])

    def test_another_branch_is_not_this_till_s_business(self):
        other = make_branch(name_ar="فرع آخر")
        now = timezone.now()
        Order.objects.create(
            id=uuid.uuid4(), branch=other, number="6006", type=Order.Type.DELIVERY,
            status=Order.Status.SENT, channel=Order.Channel.ONLINE,
            delivery_status=Order.DeliveryStatus.PENDING,
            opened_at=now, created_at=now, updated_at=now,
        )
        self.assertEqual(self.client.get(PULL).data["pending_deliveries"], [])
