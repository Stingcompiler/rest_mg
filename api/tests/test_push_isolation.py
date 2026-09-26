"""One bad record must not sink the batch.

The push contract reports a per-record verdict (accepted / duplicate /
rejected). Validating every record at the envelope level quietly broke that: a
single undeliverable row made the whole request a 400, the client read that as a
dead network, declared itself offline, and stopped syncing anything at all —
including orders carrying the day's takings.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.orders.models import Order
from tests.factories import make_branch, make_manager


class PushIsolationTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        make_manager(branch=self.branch, username="c.push", role=ManagerUser.Role.CASHIER,
                     password="push-pass-123")
        self.client = APIClient()
        self.client.post("/api/v1/auth/login/",
                         {"username": "c.push", "password": "push-pass-123"}, format="json")

    def good_order(self):
        """A complete, valid closed bill: one line, paid in full."""
        now = timezone.now().isoformat()
        oid = str(uuid.uuid4())
        return {
            "type": "order", "id": oid, "updated_at": now,
            "payload": {
                "id": oid, "number": "7001", "type": "dine_in", "status": "closed",
                "subtotal_minor": "10000", "discount_minor": "0", "total_minor": "10000",
                "opened_at": now, "closed_at": now, "created_at": now, "updated_at": now,
                "lines": [{
                    "id": str(uuid.uuid4()), "name_ar": "شاي",
                    "unit_price_minor": "10000", "qty": 1, "line_total_minor": "10000",
                }],
                "payments": [{
                    "id": str(uuid.uuid4()), "method": "cash",
                    "amount_minor": "10000", "taken_at": now,
                }],
            },
        }

    def push(self, records):
        return self.client.post(
            "/api/v1/sync/push/",
            {"batch_id": str(uuid.uuid4()), "records": records},
            format="json",
        )

    def test_a_good_batch_is_accepted(self):
        response = self.push([self.good_order()])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["accepted"], 1)

    def test_a_malformed_record_does_not_reject_the_whole_batch(self):
        # The bad row: an id that is not a UUID. Previously this made the entire
        # request a 400 and nothing in it was written.
        bad = {"type": "price_change", "id": "legacy-0", "payload": {"id": "legacy-0"}}
        good = self.good_order()

        response = self.push([bad, good])

        self.assertEqual(response.status_code, 200, "the batch must not fail as a whole")
        self.assertEqual(response.data["accepted"], 1)
        self.assertEqual(response.data["rejected"], 1)
        # And the good order really landed.
        self.assertTrue(Order.objects.filter(number="7001").exists())

    def test_the_rejected_record_is_named_in_the_results(self):
        bad = {"type": "price_change", "id": "legacy-0", "payload": {"id": "legacy-0"}}
        response = self.push([bad, self.good_order()])
        verdicts = {r["id"]: r["status"] for r in response.data["results"]}
        self.assertEqual(verdicts["legacy-0"], "rejected")

    def test_an_unknown_record_type_is_one_rejection_not_a_dead_batch(self):
        bad = {"type": "not_a_type", "id": str(uuid.uuid4()), "payload": {"id": str(uuid.uuid4())}}
        response = self.push([bad, self.good_order()])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["accepted"], 1)

    def test_a_record_missing_its_payload_is_one_rejection(self):
        bad = {"type": "order", "id": str(uuid.uuid4())}
        response = self.push([bad, self.good_order()])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["accepted"], 1)

    def test_the_envelope_itself_is_still_validated(self):
        # Shape errors that make the request meaningless are still a 400.
        response = self.client.post("/api/v1/sync/push/", {"records": []}, format="json")
        self.assertEqual(response.status_code, 400)
