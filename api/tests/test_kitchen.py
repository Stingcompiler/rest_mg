"""The kitchen display, and the order-progression rule it depends on.

The kitchen needs to see a ticket the moment it is fired, which means a live
order now reaches the server before it is paid. That relaxes idempotency in one
narrow way — a live order may progress — without weakening the rule that
protects history: a closed or void order is never mutated.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.orders.models import Order
from tests.factories import envelope, make_branch, make_device, make_manager, order_payload, record

PUSH = "/api/v1/sync/push/"
TICKETS = "/api/v1/kitchen/tickets/"


class OrderProgressionTests(TestCase):
    """A live order may progress; a terminal one is history."""

    def setUp(self):
        self.branch = make_branch()
        self.device, self.token = make_device(branch=self.branch)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Device {self.token}")

    def push(self, payload):
        return self.client.post(PUSH, envelope(record("order", payload)), format="json")

    def test_a_sent_order_is_accepted_so_the_kitchen_can_see_it(self):
        payload = order_payload(status="sent", payments=[])
        response = self.push(payload)

        self.assertEqual(response.data["results"][0]["status"], "accepted")
        order = Order.objects.get()
        self.assertEqual(order.status, Order.Status.SENT)
        # It lands on the board straight away.
        self.assertEqual(order.kitchen_status, Order.KitchenStatus.QUEUED)

    def test_a_sent_order_may_progress_to_closed(self):
        order_id = uuid.uuid4()
        self.push(order_payload(order_id=order_id, status="sent", payments=[]))
        response = self.push(order_payload(order_id=order_id, status="closed", total=25_000))

        self.assertEqual(response.data["results"][0]["status"], "accepted")
        order = Order.objects.get()
        self.assertEqual(order.status, Order.Status.CLOSED)
        self.assertEqual(order.total_minor, 25_000)
        # Replaced wholesale, not duplicated.
        self.assertEqual(order.payments.count(), 1)
        self.assertEqual(Order.objects.count(), 1)

    def test_closing_does_not_reset_what_the_kitchen_already_marked(self):
        order_id = uuid.uuid4()
        self.push(order_payload(order_id=order_id, status="sent", payments=[]))

        # The kitchen gets to work while the bill is still open.
        order = Order.objects.get()
        order.kitchen_status = Order.KitchenStatus.READY
        order.save(update_fields=["kitchen_status"])

        self.push(order_payload(order_id=order_id, status="closed", total=25_000))

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CLOSED)
        # The tablet never sends this field, so closing must not clobber it.
        self.assertEqual(order.kitchen_status, Order.KitchenStatus.READY)

    def test_a_closed_order_is_still_never_mutated(self):
        order_id = uuid.uuid4()
        self.push(order_payload(order_id=order_id, status="closed", total=25_000))

        tampered = order_payload(order_id=order_id, status="closed", total=25_000)
        tampered["total_minor"] = "1"
        tampered["subtotal_minor"] = "1"
        tampered["lines"] = [
            {**tampered["lines"][0], "unit_price_minor": "1", "line_total_minor": "1"}
        ]
        response = self.push(tampered)

        self.assertEqual(response.data["results"][0]["status"], "duplicate")
        self.assertEqual(Order.objects.get().total_minor, 25_000)

    def test_an_open_order_is_still_refused(self):
        response = self.push(order_payload(status="open"))
        self.assertEqual(response.data["results"][0]["status"], "rejected")


class KitchenBoardTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.device, self.token = make_device(branch=self.branch)
        tablet = APIClient()
        tablet.credentials(HTTP_AUTHORIZATION=f"Device {self.token}")
        tablet.post(
            PUSH,
            envelope(record("order", order_payload(status="sent", payments=[]))),
            format="json",
        )

        self.kitchen_user = make_manager(
            branch=self.branch,
            username="kitchen",
            role=ManagerUser.Role.KITCHEN,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.kitchen_user)

    def test_the_board_lists_fired_tickets_with_their_lines(self):
        response = self.client.get(TICKETS)

        self.assertEqual(response.status_code, 200)
        tickets = response.data["tickets"]
        self.assertEqual(len(tickets), 1)
        self.assertEqual(tickets[0]["kitchen_status"], "queued")
        self.assertEqual(tickets[0]["lines"][0]["name_ar"], "شاورما لحم")
        # The kitchen has no business seeing money.
        self.assertNotIn("total_minor", tickets[0])

    def test_advancing_a_ticket_touches_only_the_kitchen_field(self):
        order = Order.objects.get()
        response = self.client.post(
            f"{TICKETS}{order.id}/status/", {"kitchen_status": "ready"}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.kitchen_status, Order.KitchenStatus.READY)
        self.assertIsNotNone(order.kitchen_updated_at)
        # The bill is untouched.
        self.assertEqual(order.status, Order.Status.SENT)

    def test_a_served_ticket_leaves_the_board(self):
        order = Order.objects.get()
        self.client.post(f"{TICKETS}{order.id}/status/", {"kitchen_status": "served"}, format="json")

        self.assertEqual(self.client.get(TICKETS).data["tickets"], [])

    def test_an_unknown_status_is_refused(self):
        order = Order.objects.get()
        response = self.client.post(
            f"{TICKETS}{order.id}/status/", {"kitchen_status": "burnt"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_a_cashier_may_not_read_the_kitchen_board(self):
        cashier = make_manager(
            branch=self.branch, username="cashier.x", role=ManagerUser.Role.CASHIER
        )
        client = APIClient()
        client.force_authenticate(user=cashier)
        self.assertIn(client.get(TICKETS).status_code, {401, 403})
