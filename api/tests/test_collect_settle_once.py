"""Money is taken once (batch 43).

Review of 10 October:

  - F02: two tills collecting the same website order at the same moment were
    both accepted, and the second replaced the first's payment. The order's
    state was read before the write's transaction, without a lock, so both
    passed the "already settled" check.
  - F03: a repayment sent again after its answer was lost (the same request,
    retried) was recorded twice: 25,000 owed, 5,000 repaid, balance 15,000.

Now the order is locked for the whole check-and-write, and a repayment carries
the till's attempt key, so a retry returns the first result.
"""
from __future__ import annotations

import threading
import time
import uuid
from unittest import mock

from django.db import connection
from django.test import TransactionTestCase

from apps.accounts.models import ManagerUser
from apps.customers.models import CustomerSettlement
from apps.orders.models import Order
from apps.sync import services
from tests.factories import make_device
from tests.test_customers import CustomerTestCase
from tests.test_delivery_status import DeliveryStatusTestCase
from tests.test_online_orders_readiness import OnlineOrderTestCase


class ConcurrentCollectionTests(TransactionTestCase):
    """Two real transactions on PostgreSQL; only the timing is arranged."""

    place_order = DeliveryStatusTestCase.place_order
    as_role = DeliveryStatusTestCase.as_role
    set_status = DeliveryStatusTestCase.set_status
    confirmed_order = OnlineOrderTestCase.confirmed_order
    collection = OnlineOrderTestCase.collection

    def setUp(self):
        DeliveryStatusTestCase.setUp(self)
        self.cashier = self.as_role("c.till", ManagerUser.Role.CASHIER)
        self.device, _ = make_device(self.branch)

    def test_two_tills_at_once_one_is_accepted_the_other_refused(self):
        oid = self.confirmed_order()
        first, second = self.collection(oid), self.collection(oid)
        real_check = services._refuse_online_collection
        results = {}

        def slow_check(*args, **kwargs):
            # Hold the first collection between its checks and its write, long
            # enough for the second to arrive.
            outcome = real_check(*args, **kwargs)
            if threading.current_thread().name == "first":
                time.sleep(0.6)
            return outcome

        def run(name, payload):
            try:
                results[name] = services.apply_record(
                    {"type": "order", "id": payload["id"], "payload": payload}, self.device, self.branch
                )
            finally:
                connection.close()

        with mock.patch.object(services, "_refuse_online_collection", side_effect=slow_check):
            a = threading.Thread(target=run, name="first", args=("first", first))
            b = threading.Thread(target=run, name="second", args=("second", second))
            a.start()
            time.sleep(0.2)
            b.start()
            a.join()
            b.join()

        self.assertEqual(results["first"].status, services.ACCEPTED)
        self.assertEqual(results["second"].status, services.REJECTED)
        self.assertEqual(results["second"].reason["code"], "already_settled")
        kept = [str(p.id) for p in Order.objects.get(id=oid).payments.all()]
        self.assertEqual(kept, [first["payments"][0]["id"]])


class RetriedSettlementTests(CustomerTestCase):
    def settle(self, person, amount, key=None):
        headers = {"HTTP_IDEMPOTENCY_KEY": key} if key else {}
        return self.client.post(
            f"/api/v1/customers/{person['id']}/settle/",
            {"amount_minor": str(amount), "method": "cash"}, format="json", **headers,
        )

    def test_a_retry_with_the_same_key_records_it_once(self):
        person = self.make_customer()
        self.charge(person["id"], 25_000)
        key = str(uuid.uuid4())
        first = self.settle(person, 5_000, key)
        again = self.settle(person, 5_000, key)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["balance_minor"], "20000")
        self.assertEqual(CustomerSettlement.objects.filter(customer_id=person["id"]).count(), 1)

    def test_the_same_key_for_a_different_repayment_is_refused(self):
        person = self.make_customer()
        self.charge(person["id"], 25_000)
        key = str(uuid.uuid4())
        self.settle(person, 5_000, key)
        response = self.settle(person, 7_000, key)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "idempotency_conflict")

    def test_two_different_keys_are_two_repayments(self):
        person = self.make_customer()
        self.charge(person["id"], 25_000)
        self.settle(person, 5_000, str(uuid.uuid4()))
        response = self.settle(person, 5_000, str(uuid.uuid4()))
        self.assertEqual(response.data["balance_minor"], "15000")

    def test_a_malformed_key_is_refused(self):
        person = self.make_customer()
        self.charge(person["id"], 25_000)
        self.assertEqual(self.settle(person, 5_000, "not-a-uuid").status_code, 400)
