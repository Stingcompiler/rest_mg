"""A record the server refuses is logged, not only reported to the device.

A refused bill waits on the till until someone opens its sync screen. The log
line is how a till that keeps sending something the server will not take gets
noticed from outside the restaurant.
"""
from __future__ import annotations

from django.test import TestCase
from rest_framework.test import APIClient

from tests.factories import envelope, make_device, order_payload, record


class SyncRejectionLoggingTests(TestCase):
    def test_a_refused_record_is_logged_with_its_reason(self):
        _, token = make_device()
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Device {token}")
        payload = order_payload(total=25_000, payments=[])  # closed with nothing paid

        with self.assertLogs("sudanpos.sync", level="WARNING") as logs:
            response = client.post("/api/v1/sync/push/", envelope(record("order", payload)), format="json")

        self.assertEqual(response.data["rejected"], 1)
        self.assertEqual(len(logs.records), 1)
        self.assertIn(payload["id"], logs.output[0])
        self.assertIn("payments", logs.output[0])

    def test_an_accepted_record_is_not_logged(self):
        _, token = make_device()
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Device {token}")
        with self.assertNoLogs("sudanpos.sync", level="WARNING"):
            client.post("/api/v1/sync/push/", envelope(record("order", order_payload())), format="json")
