"""Customers, what they owe, and what they have paid back."""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.customers.models import Customer
from apps.orders.models import Order, Payment
from tests.factories import make_branch, make_manager


class CustomerTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch()
        make_manager(branch=self.branch, username="c.cust", role=ManagerUser.Role.CASHIER,
                     password="cust-pass-123", display_name="سمية")
        self.client = APIClient()
        self.client.post("/api/v1/auth/login/",
                         {"username": "c.cust", "password": "cust-pass-123"}, format="json")

    def make_customer(self, name="أحمد"):
        return self.client.post("/api/v1/customers/", {"name": name, "phone": "0912345678"},
                                format="json").data

    def charge(self, customer_id, amount, number="8001"):
        """A closed bill paid on credit by this customer."""
        now = timezone.now()
        order = Order.objects.create(
            id=uuid.uuid4(), branch=self.branch, number=number, status=Order.Status.CLOSED,
            subtotal_minor=amount, total_minor=amount,
            opened_at=now, closed_at=now, created_at=now, updated_at=now,
        )
        Payment.objects.create(
            id=uuid.uuid4(), branch=self.branch, order=order, method=Payment.Method.CREDIT,
            amount_minor=amount, customer_id=customer_id, taken_at=now,
            created_at=now, updated_at=now,
        )
        return order


class CustomerCrudTests(CustomerTestCase):
    def test_a_cashier_can_create_a_customer(self):
        # The person at the till hands over the goods, so they must be able to
        # name who took them.
        response = self.client.post("/api/v1/customers/", {"name": "عمر"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["balance_minor"], "0")

    def test_the_kitchen_cannot(self):
        make_manager(branch=self.branch, username="k.cust", role=ManagerUser.Role.KITCHEN,
                     password="kit-pass-123")
        kitchen = APIClient()
        kitchen.post("/api/v1/auth/login/",
                     {"username": "k.cust", "password": "kit-pass-123"}, format="json")
        self.assertEqual(kitchen.get("/api/v1/customers/").status_code, 403)

    def test_a_customer_is_retired_not_deleted(self):
        person = self.make_customer()
        response = self.client.delete(f"/api/v1/customers/{person['id']}/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_active"])
        # Still there, so the bills that name them still read correctly.
        self.assertTrue(Customer.objects.filter(id=person["id"]).exists())

    def test_search_by_name(self):
        self.make_customer("أحمد")
        self.make_customer("عمر")
        response = self.client.get("/api/v1/customers/?q=عمر")
        self.assertEqual(response.data["total"], 1)
        self.assertEqual(response.data["results"][0]["name"], "عمر")


class BalanceTests(CustomerTestCase):
    def test_a_credit_sale_becomes_a_balance(self):
        person = self.make_customer()
        self.charge(person["id"], 25_000)
        response = self.client.get(f"/api/v1/customers/{person['id']}/")
        self.assertEqual(response.data["owed_minor"], "25000")
        self.assertEqual(response.data["balance_minor"], "25000")

    def test_a_settlement_reduces_the_balance_without_touching_the_sale(self):
        person = self.make_customer()
        order = self.charge(person["id"], 25_000)

        response = self.client.post(f"/api/v1/customers/{person['id']}/settle/",
                                    {"amount_minor": "10000", "method": "cash"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["balance_minor"], "15000")

        # The sale is exactly as it happened — repayment is its own record.
        order.refresh_from_db()
        self.assertEqual(order.total_minor, 25_000)
        self.assertEqual(order.payments.first().amount_minor, 25_000)

    def test_paying_more_than_is_owed_is_refused(self):
        person = self.make_customer()
        self.charge(person["id"], 10_000)
        response = self.client.post(f"/api/v1/customers/{person['id']}/settle/",
                                    {"amount_minor": "15000"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "exceeds_balance")

    def test_a_zero_or_negative_settlement_is_refused(self):
        person = self.make_customer()
        self.charge(person["id"], 10_000)
        for bad in ["0", "-500"]:
            response = self.client.post(f"/api/v1/customers/{person['id']}/settle/",
                                        {"amount_minor": bad}, format="json")
            self.assertEqual(response.status_code, 400, bad)

    def test_the_list_puts_the_biggest_debtor_first(self):
        small = self.make_customer("صغير")
        big = self.make_customer("كبير")
        self.charge(small["id"], 5_000, number="8002")
        self.charge(big["id"], 50_000, number="8003")
        rows = self.client.get("/api/v1/customers/").data["results"]
        self.assertEqual(rows[0]["name"], "كبير")

    def test_only_those_still_owing_when_asked(self):
        paid = self.make_customer("مسدّد")
        owing = self.make_customer("مدين")
        self.charge(paid["id"], 5_000, number="8004")
        self.charge(owing["id"], 7_000, number="8005")
        self.client.post(f"/api/v1/customers/{paid['id']}/settle/",
                         {"amount_minor": "5000"}, format="json")
        rows = self.client.get("/api/v1/customers/?owing=true").data["results"]
        self.assertEqual([r["name"] for r in rows], ["مدين"])


class StatementTests(CustomerTestCase):
    def test_the_statement_shows_both_sides_newest_first(self):
        person = self.make_customer()
        self.charge(person["id"], 20_000, number="8006")
        self.client.post(f"/api/v1/customers/{person['id']}/settle/",
                         {"amount_minor": "8000", "method": "bank", "reference": "9911"},
                         format="json")

        response = self.client.get(f"/api/v1/customers/{person['id']}/statement/")
        self.assertEqual(response.status_code, 200)
        kinds = [line["kind"] for line in response.data["results"]]
        self.assertEqual(kinds, ["settlement", "charge"])  # newest first
        self.assertEqual(response.data["customer"]["balance_minor"], "12000")

    def test_a_charge_line_names_the_bill_it_came_from(self):
        person = self.make_customer()
        self.charge(person["id"], 9_000, number="8007")
        lines = self.client.get(f"/api/v1/customers/{person['id']}/statement/").data["results"]
        charge = next(line for line in lines if line["kind"] == "charge")
        self.assertEqual(charge["order_number"], "8007")


class CustomerSyncTests(CustomerTestCase):
    def test_customers_are_pulled_to_the_till(self):
        # A credit sale must name who owes it, and the till takes credit with the
        # line down as readily as with it up — so the names have to be on it.
        self.make_customer("أحمد")
        response = self.client.get("/api/v1/sync/pull/")
        self.assertEqual(response.status_code, 200)
        names = [c["name"] for c in response.data["customers"]]
        self.assertIn("أحمد", names)
