"""A bank or wallet repayment carries its reference (batch 60).

Review of 10 October, F08: a customer's repayment by bank transfer or wallet
could be recorded with no reference, while a bill paid the same way must have
one. Without it the repayment cannot be matched against the bank's statement
later. Cash needs none.
"""
from __future__ import annotations

from apps.customers.models import CustomerSettlement
from tests.test_customers import CustomerTestCase


class SettlementReferenceTests(CustomerTestCase):
    def settle(self, person, **body):
        data = {"amount_minor": "5000", **body}
        return self.client.post(f"/api/v1/customers/{person['id']}/settle/", data, format="json")

    def owing(self):
        person = self.make_customer()
        self.charge(person["id"], 25_000)
        return person

    def test_a_bank_repayment_without_a_reference_is_refused(self):
        person = self.owing()
        for body in ({"method": "bank"}, {"method": "bank", "reference": ""}, {"method": "wallet", "reference": "   "}):
            response = self.settle(person, **body)
            self.assertEqual(response.status_code, 400, body)
            self.assertIn("reference", str(response.data), body)
        self.assertFalse(CustomerSettlement.objects.filter(customer_id=person["id"]).exists())

    def test_a_bank_or_wallet_repayment_with_one_is_recorded_with_it(self):
        person = self.owing()
        self.assertEqual(self.settle(person, method="bank", reference=" TRX-4471 ").status_code, 201)
        self.assertEqual(self.settle(person, method="wallet", reference="BOK-12").status_code, 201)
        kept = set(CustomerSettlement.objects.filter(customer_id=person["id"]).values_list("reference", flat=True))
        self.assertEqual(kept, {"TRX-4471", "BOK-12"})

    def test_cash_needs_none(self):
        person = self.owing()
        self.assertEqual(self.settle(person, method="cash").status_code, 201)
        self.assertEqual(self.settle(person).status_code, 201)
