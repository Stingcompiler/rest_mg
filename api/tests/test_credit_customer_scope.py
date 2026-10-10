"""A debt goes only to a customer the branch may charge (batch 48).

Review of 10 October, F05: a credit payment named its customer by id, and the
id was only checked to be a UUID. A till of branch A put 25,000 on the account
of branch B's customer, and a made-up id was stored as a debt nobody owns.
Single-branch deployments never meet it; it had to close before more than one
branch is switched on. Now the customer must exist and be the order's branch's
own or shared.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.orders.models import Payment
from tests.factories import envelope, make_branch, make_device, order_payload, record


class CreditCustomerScopeTests(TestCase):
    def setUp(self):
        self.branch_a, self.branch_b = make_branch(), make_branch()
        _, token = make_device(self.branch_a)
        self.tablet = APIClient()
        self.tablet.credentials(HTTP_AUTHORIZATION=f"Device {token}")

    def customer(self, branch):
        now = timezone.now()
        return Customer.objects.create(id=uuid.uuid4(), branch=branch, name="أحمد", created_at=now, updated_at=now)

    def push_credit(self, customer_id):
        now = timezone.now().isoformat()
        payload = order_payload(payments=[{
            "id": str(uuid.uuid4()), "method": "credit", "amount_minor": "25000",
            "customer_id": str(customer_id), "taken_at": now,
        }])
        response = self.tablet.post("/api/v1/sync/push/", envelope(record("order", payload)), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["results"][0]

    def test_another_branch_s_customer_is_refused(self):
        other = self.customer(self.branch_b)
        result = self.push_credit(other.id)
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["reason"]["code"], "customer_out_of_scope")
        self.assertFalse(Payment.objects.filter(customer_id=other.id).exists())

    def test_a_customer_that_does_not_exist_is_refused(self):
        result = self.push_credit(uuid.uuid4())
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["reason"]["code"], "customer_out_of_scope")

    def test_the_branch_s_own_customer_is_charged(self):
        own = self.customer(self.branch_a)
        self.assertEqual(self.push_credit(own.id)["status"], "accepted")
        self.assertTrue(Payment.objects.filter(customer_id=own.id).exists())

    def test_a_shared_customer_is_charged(self):
        shared = self.customer(None)
        self.assertEqual(self.push_credit(shared.id)["status"], "accepted")
