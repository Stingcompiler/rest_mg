"""Paging the lists that have no natural ceiling.

The audit log, orders, deliveries and customers all used to answer with a hard
slice: the newest N, with no way to ask for the next N. These tests hold the
line on the two properties that make a page a page rather than a truncation --
that the caller is told how many rows exist in total, and that asking for the
next offset actually returns the rows the first page did not.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.audit.models import AuditLog
from apps.orders.models import Order, Payment
from tests.factories import make_branch, make_manager


class AuditPagingTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.manager = make_manager(branch=self.branch, display_name="المدير")
        self.client = APIClient()
        self.client.post("/api/v1/auth/login/",
                         {"username": "manager", "password": "correct-horse-battery"},
                         format="json")
        for i in range(25):
            AuditLog.objects.create(
                branch=self.branch, action=AuditLog.Action.ITEM_CREATED,
                actor_id=self.manager.id, actor_name="المدير", target_label=f"صنف {i}",
            )

    def test_the_envelope_says_how_many_there_are(self):
        body = self.client.get("/api/v1/audit/log/?limit=10").data
        self.assertEqual(len(body["results"]), 10)
        self.assertEqual(body["total"], 25)
        self.assertEqual(body["limit"], 10)
        self.assertEqual(body["offset"], 0)
        self.assertEqual(body["next_offset"], 10)

    def test_the_second_page_continues_the_first(self):
        first = self.client.get("/api/v1/audit/log/?limit=10").data
        second = self.client.get("/api/v1/audit/log/?limit=10&offset=10").data
        ids = {row["id"] for row in first["results"]}
        self.assertEqual(len(ids & {row["id"] for row in second["results"]}), 0)
        self.assertEqual(second["offset"], 10)

    def test_the_last_page_offers_no_next(self):
        body = self.client.get("/api/v1/audit/log/?limit=10&offset=20").data
        self.assertEqual(len(body["results"]), 5)
        self.assertIsNone(body["next_offset"])

    def test_an_offset_past_the_end_is_empty_not_an_error(self):
        body = self.client.get("/api/v1/audit/log/?limit=10&offset=999").data
        self.assertEqual(body["results"], [])
        self.assertEqual(body["total"], 25)
        self.assertIsNone(body["next_offset"])

    def test_a_nonsense_limit_falls_back_instead_of_failing(self):
        # Query strings are client input; a bad one must not be a 500.
        for bad in ("abc", "", "-5", "0"):
            response = self.client.get(f"/api/v1/audit/log/?limit={bad}")
            self.assertEqual(response.status_code, 200, bad)
            self.assertGreaterEqual(response.data["limit"], 1, bad)

    def test_the_limit_is_capped(self):
        # Otherwise ?limit=1000000 is a denial of service with a polite name.
        body = self.client.get("/api/v1/audit/log/?limit=99999").data
        self.assertLessEqual(body["limit"], 500)

    def test_filters_and_paging_compose(self):
        body = self.client.get("/api/v1/audit/log/?action=item&limit=5").data
        self.assertEqual(body["total"], 25)  # the filter's total, not the table's
        self.assertEqual(len(body["results"]), 5)


class CustomerPagingTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        make_manager(branch=self.branch, username="c.page", role=ManagerUser.Role.CASHIER,
                     password="page-pass-123", display_name="سمية")
        self.client = APIClient()
        self.client.post("/api/v1/auth/login/",
                         {"username": "c.page", "password": "page-pass-123"}, format="json")
        # Twelve customers owing 1_000 ... 12_000, so the order is unambiguous.
        for i in range(1, 13):
            person = self.client.post("/api/v1/customers/", {"name": f"عميل {i:02d}"},
                                      format="json").data
            amount = i * 1_000
            now = timezone.now()
            order = Order.objects.create(
                id=uuid.uuid4(), branch=self.branch, number=f"90{i:02d}",
                status=Order.Status.CLOSED, subtotal_minor=amount, total_minor=amount,
                opened_at=now, closed_at=now, created_at=now, updated_at=now,
            )
            Payment.objects.create(
                id=uuid.uuid4(), branch=self.branch, order=order,
                method=Payment.Method.CREDIT, amount_minor=amount,
                customer_id=person["id"], taken_at=now, created_at=now, updated_at=now,
            )

    def test_the_biggest_debtor_leads_and_paging_keeps_the_order(self):
        # The point of the list is to be worked through from the top, so page 2
        # must be the *next* biggest debtors, not a re-sorted slice.
        first = self.client.get("/api/v1/customers/?limit=5").data
        second = self.client.get("/api/v1/customers/?limit=5&offset=5").data
        got = [row["name"] for row in first["results"] + second["results"]]
        expected = [f"عميل {i:02d}" for i in range(12, 2, -1)]
        self.assertEqual(got, expected)
        self.assertEqual(first["total"], 12)

    def test_the_balance_survives_being_paged(self):
        body = self.client.get("/api/v1/customers/?limit=3").data
        top = body["results"][0]
        self.assertEqual(top["balance_minor"], "12000")
        self.assertEqual(top["owed_minor"], "12000")
        self.assertEqual(top["settled_minor"], "0")

    def test_owing_filter_counts_only_those_still_owing(self):
        body = self.client.get("/api/v1/customers/?owing=true&limit=4").data
        self.assertEqual(body["total"], 12)
        self.assertEqual(len(body["results"]), 4)

    def test_reading_a_page_does_not_cost_a_query_per_customer(self):
        # The balances are annotated in SQL. If this regresses to a pair of
        # queries per row, twelve customers would blow well past this ceiling.
        # The count stays flat as customers are added -- that is the property
        # under test, not the exact number.
        with self.assertNumQueries(4):
            self.client.get("/api/v1/customers/?limit=12")

    def test_the_outstanding_total_covers_everyone_not_just_the_page(self):
        # The screen shows one headline figure above a paged list. Summing the
        # visible rows would understate the debt by everything on page 2.
        body = self.client.get("/api/v1/customers/?limit=3").data
        self.assertEqual(len(body["results"]), 3)
        self.assertEqual(body["outstanding_minor"], str(sum(i * 1_000 for i in range(1, 13))))

    def test_the_outstanding_total_respects_the_filter(self):
        body = self.client.get("/api/v1/customers/?q=عميل 01&limit=5").data
        self.assertEqual(body["outstanding_minor"], "1000")


class OrderPagingTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        make_manager(branch=self.branch, display_name="المدير")
        self.client = APIClient()
        self.client.post("/api/v1/auth/login/",
                         {"username": "manager", "password": "correct-horse-battery"},
                         format="json")
        now = timezone.now()
        for i in range(15):
            Order.objects.create(
                id=uuid.uuid4(), branch=self.branch, number=f"70{i:02d}",
                status=Order.Status.CLOSED, opened_at=now, created_at=now, updated_at=now,
            )

    def test_orders_page(self):
        body = self.client.get("/api/v1/orders/?limit=6").data
        self.assertEqual(len(body["results"]), 6)
        self.assertEqual(body["total"], 15)
        self.assertEqual(body["next_offset"], 6)

    def test_deliveries_page(self):
        now = timezone.now()
        for i in range(8):
            Order.objects.create(
                id=uuid.uuid4(), branch=self.branch, number=f"80{i:02d}",
                channel=Order.Channel.ONLINE, status=Order.Status.OPEN,
                opened_at=now, created_at=now, updated_at=now,
            )
        body = self.client.get("/api/v1/orders/deliveries/?limit=3").data
        self.assertEqual(len(body["results"]), 3)
        self.assertEqual(body["total"], 8)
        self.assertEqual(body["next_offset"], 3)
