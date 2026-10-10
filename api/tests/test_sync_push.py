"""The sync push contract: idempotent, immutable, and never wedged by one bad row."""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.orders.models import Order, Payment
from apps.shifts.models import Shift
from tests.factories import (
    make_customer,
    envelope,
    make_device,
    order_payload,
    record,
    shift_payload,
)

PUSH = "/api/v1/sync/push/"


class PushTestCase(TestCase):
    def setUp(self):
        self.device, self.token = make_device()
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Device {self.token}")

    def push(self, *records):
        return self.client.post(PUSH, envelope(*records), format="json")


class AuthenticationTests(PushTestCase):
    def test_a_batch_without_credentials_is_refused(self):
        client = APIClient()
        response = client.post(PUSH, envelope(), format="json")
        self.assertIn(response.status_code, {401, 403})

    def test_an_unknown_token_is_refused(self):
        self.client.credentials(HTTP_AUTHORIZATION="Device not-a-real-token")
        self.assertEqual(self.push().status_code, 401)

    def test_a_revoked_device_is_refused(self):
        self.device.revoke()
        self.assertEqual(self.push().status_code, 401)

    def test_a_successful_push_updates_last_seen(self):
        self.assertIsNone(self.device.last_seen_at)
        self.push(record("order", order_payload()))
        self.device.refresh_from_db()
        self.assertIsNotNone(self.device.last_seen_at)


class IdempotencyTests(PushTestCase):
    def test_replaying_a_batch_writes_once(self):
        payload = order_payload()
        batch = envelope(record("order", payload))

        first = self.client.post(PUSH, batch, format="json")
        second = self.client.post(PUSH, batch, format="json")

        self.assertEqual(first.data["accepted"], 1)
        self.assertEqual(second.data["accepted"], 0)
        self.assertEqual(second.data["duplicates"], 1)
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Order.objects.get().lines.count(), 1)
        self.assertEqual(Payment.objects.count(), 1)

    def test_a_replay_never_rewrites_a_closed_order(self):
        payload = order_payload(total=25_000)
        self.push(record("order", payload))

        tampered = {**payload, "total_minor": "1", "subtotal_minor": "1"}
        tampered["lines"] = [{**payload["lines"][0], "unit_price_minor": "1", "line_total_minor": "1"}]
        response = self.push(record("order", tampered))

        self.assertEqual(response.data["results"][0]["status"], "duplicate")
        self.assertEqual(Order.objects.get().total_minor, 25_000)

    def test_one_bad_record_does_not_reject_the_batch(self):
        good = order_payload()
        bad = order_payload(total=25_000, payments=[])  # closed with nothing paid

        response = self.push(record("order", good), record("order", bad))

        self.assertEqual(response.data["accepted"], 1)
        self.assertEqual(response.data["rejected"], 1)
        self.assertEqual(Order.objects.count(), 1)


class OrderRuleTests(PushTestCase):
    def test_an_open_order_is_not_accepted(self):
        response = self.push(record("order", order_payload(status="open")))
        self.assertEqual(response.data["results"][0]["status"], "rejected")
        self.assertIn("status", response.data["results"][0]["reason"])

    def test_an_order_cannot_close_while_an_amount_is_due(self):
        partial = [
            {
                "id": str(uuid.uuid4()),
                "method": "cash",
                "amount_minor": "10000",
                "taken_at": timezone.now().isoformat(),
            }
        ]
        response = self.push(record("order", order_payload(total=25_000, payments=partial)))
        self.assertEqual(response.data["results"][0]["status"], "rejected")
        self.assertIn("payments", response.data["results"][0]["reason"])

    def test_credit_settles_the_balance(self):
        credit = [
            {
                "id": str(uuid.uuid4()),
                "method": "credit",
                "amount_minor": "25000",
                "customer_id": str(make_customer(self.device.branch).id),
                "taken_at": timezone.now().isoformat(),
            }
        ]
        response = self.push(record("order", order_payload(total=25_000, payments=credit)))
        self.assertEqual(response.data["results"][0]["status"], "accepted")
        self.assertEqual(Order.objects.get().amount_due_minor, 0)

    def test_credit_without_a_customer_is_refused(self):
        credit = [
            {
                "id": str(uuid.uuid4()),
                "method": "credit",
                "amount_minor": "25000",
                "taken_at": timezone.now().isoformat(),
            }
        ]
        response = self.push(record("order", order_payload(total=25_000, payments=credit)))
        self.assertEqual(response.data["results"][0]["status"], "rejected")

    def test_a_bank_payment_needs_a_reference(self):
        bank = [
            {
                "id": str(uuid.uuid4()),
                "method": "bank",
                "amount_minor": "25000",
                "taken_at": timezone.now().isoformat(),
            }
        ]
        response = self.push(record("order", order_payload(total=25_000, payments=bank)))
        self.assertEqual(response.data["results"][0]["status"], "rejected")

    def test_totals_must_agree_with_the_lines(self):
        payload = order_payload(total=25_000)
        payload["lines"][0]["line_total_minor"] = "20000"
        payload["lines"][0]["unit_price_minor"] = "20000"
        response = self.push(record("order", payload))
        self.assertEqual(response.data["results"][0]["status"], "rejected")

    def test_a_discount_may_not_exceed_the_subtotal(self):
        payload = order_payload(total=25_000)
        payload["discount_minor"] = "30000"
        response = self.push(record("order", payload))
        self.assertEqual(response.data["results"][0]["status"], "rejected")

    def test_money_survives_a_round_trip_beyond_double_precision(self):
        huge = 2**53 + 1
        payments = [
            {
                "id": str(uuid.uuid4()),
                "method": "cash",
                "amount_minor": str(huge),
                "taken_at": timezone.now().isoformat(),
            }
        ]
        self.push(record("order", order_payload(total=huge, payments=payments)))
        self.assertEqual(Order.objects.get().total_minor, huge)


class ShiftTests(PushTestCase):
    def test_a_shift_backfills_orders_that_arrived_first(self):
        shift_id = uuid.uuid4()
        self.push(record("order", order_payload(shift_ref=shift_id)))

        order = Order.objects.get()
        self.assertIsNone(order.shift_id)
        self.assertEqual(order.shift_ref, shift_id)

        self.push(record("shift", shift_payload(shift_id=shift_id)))

        order.refresh_from_db()
        self.assertEqual(order.shift_id, shift_id)

    def test_expected_cash_excludes_credit(self):
        shift_id = uuid.uuid4()
        cash = [
            {
                "id": str(uuid.uuid4()),
                "method": "cash",
                "amount_minor": "25000",
                "taken_at": timezone.now().isoformat(),
            }
        ]
        credit = [
            {
                "id": str(uuid.uuid4()),
                "method": "credit",
                "amount_minor": "40000",
                "customer_id": str(uuid.uuid4()),
                "taken_at": timezone.now().isoformat(),
            }
        ]
        self.push(record("order", order_payload(total=25_000, payments=cash, shift_ref=shift_id)))
        self.push(record("order", order_payload(total=40_000, payments=credit, shift_ref=shift_id)))
        self.push(record("shift", shift_payload(shift_id=shift_id, expected=25_000, counted=25_000)))

        shift = Shift.objects.get()
        # 65,000 was sold; only the 25,000 in cash is in the drawer.
        self.assertEqual(shift.recompute_expected_cash(), 25_000)

    def test_a_variance_beyond_tolerance_needs_a_reason(self):
        response = self.push(
            record("shift", shift_payload(expected=100_000, counted=85_000, reason=""))
        )
        self.assertEqual(response.data["results"][0]["status"], "rejected")
        self.assertIn("variance_reason", response.data["results"][0]["reason"])

    def test_a_variance_with_a_reason_is_accepted(self):
        response = self.push(
            record(
                "shift",
                shift_payload(expected=100_000, counted=85_000, reason="نقص في الدرج، أُبلغ المدير"),
            )
        )
        self.assertEqual(response.data["results"][0]["status"], "accepted")
        self.assertEqual(Shift.objects.get().variance_minor, -15_000)

    def test_the_counted_rows_must_add_up(self):
        payload = shift_payload(expected=25_000, counted=25_000)
        payload["counts"][0]["line_total_minor"] = "99999"
        response = self.push(record("shift", payload))
        self.assertEqual(response.data["results"][0]["status"], "rejected")


class EnvelopeTests(PushTestCase):
    def test_envelope_and_payload_ids_must_match(self):
        """A mismatched record is refused — as one rejection, not as a dead batch.

        This test used to assert a 400 for the whole request. That was the
        behaviour that took a till offline: one unsendable row and *nothing*
        synced, including the day's orders. The rule itself is unchanged — the
        record is still refused — only its blast radius is.
        """
        payload = order_payload()
        response = self.client.post(
            PUSH,
            {"batch_id": str(uuid.uuid4()), "records": [{"type": "order", "id": str(uuid.uuid4()), "payload": payload}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["rejected"], 1)
        self.assertEqual(response.data["results"][0]["status"], "rejected")

    def test_an_oversized_batch_is_refused_rather_than_truncated(self):
        records = [record("order", order_payload()) for _ in range(501)]
        response = self.client.post(
            PUSH, {"batch_id": str(uuid.uuid4()), "records": records}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)
