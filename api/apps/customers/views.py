"""Customers and their accounts.

Three questions this answers, in order of how often they are asked:

  who owes us money        → the list, with a balance on each row
  what does *this* one owe → the statement: every credit sale and every repayment
  they are paying now      → a settlement

The balance is derived, never stored. A stored total is a second copy of the
truth that drifts the first time anything is added out of band; here it is always
the sum of what was sold on credit minus what has been paid back.
"""
from __future__ import annotations

import uuid

from django.db.models import BigIntegerField, F, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.permissions import IsCatalogEditor
from apps.audit import services as audit
from apps.audit.models import AuditLog
from apps.core.fields import MoneyField
from apps.core.query import page, parse_page
from apps.core.scoping import in_branch_or_shared
from apps.customers.models import Customer, CustomerSettlement
from apps.orders.models import Payment


class CustomerSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    note = serializers.CharField(max_length=240, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)


class SettlementSerializer(serializers.Serializer):
    amount_minor = MoneyField()
    method = serializers.ChoiceField(
        choices=CustomerSettlement.Method.choices, default=CustomerSettlement.Method.CASH
    )
    reference = serializers.CharField(max_length=80, required=False, allow_blank=True)
    note = serializers.CharField(max_length=240, required=False, allow_blank=True)

    def validate_amount_minor(self, value):
        if value <= 0:
            raise serializers.ValidationError("A settlement must be a positive amount.")
        return value


def _owed(customer) -> int:
    """What this customer was sold on credit, in total."""
    total = Payment.objects.filter(
        method=Payment.Method.CREDIT, customer_id=customer.id
    ).aggregate(total=Sum("amount_minor"))["total"]
    return int(total or 0)


def _settled(customer) -> int:
    total = customer.settlements.aggregate(total=Sum("amount_minor"))["total"]
    return int(total or 0)


def _with_balances(people):
    """Annotate what each customer owes and has paid, in SQL.

    The list used to work these out a row at a time and then sort the result in
    Python, which meant reading every customer in the branch before showing the
    first one. Paging that would only have hidden the cost. Annotated here, a
    page of customers is a fixed number of queries and the ordering is the
    database's, so page 2 continues page 1 instead of re-sorting a slice.
    """
    owed = (
        Payment.objects.filter(method=Payment.Method.CREDIT, customer_id=OuterRef("pk"))
        .values("customer_id")
        .annotate(total=Sum("amount_minor"))
        .values("total")
    )
    settled = (
        CustomerSettlement.objects.filter(customer_id=OuterRef("pk"))
        .values("customer_id")
        .annotate(total=Sum("amount_minor"))
        .values("total")
    )
    zero = Value(0, output_field=BigIntegerField())
    return people.annotate(
        owed_total=Coalesce(Subquery(owed, output_field=BigIntegerField()), zero),
        settled_total=Coalesce(Subquery(settled, output_field=BigIntegerField()), zero),
    ).annotate(balance_total=F("owed_total") - F("settled_total"))


def _as_dict(customer, *, with_balance: bool = True) -> dict:
    body = {
        "id": str(customer.id),
        "name": customer.name,
        "phone": customer.phone,
        "note": customer.note,
        "is_active": customer.is_active,
    }
    if with_balance:
        # Annotated by _with_balances on the list path; computed per object on
        # the single-customer paths, where one row costs two queries anyway.
        owed = getattr(customer, "owed_total", None)
        settled = getattr(customer, "settled_total", None)
        if owed is None or settled is None:
            owed, settled = _owed(customer), _settled(customer)
        body |= {
            "owed_minor": str(owed),
            "settled_minor": str(settled),
            "balance_minor": str(owed - settled),
        }
    return body


class CustomerViewSet(viewsets.ViewSet):
    """Owner, manager or cashier — whoever hands over goods on credit needs to be
    able to name who took them, and that is usually the person at the till."""

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsCatalogEditor]

    def _scope(self, request):
        people = Customer.objects.all()
        if request.user.branch_id:
            people = people.filter(in_branch_or_shared(request.user.branch_id))
        return people

    def list(self, request):
        people = self._scope(request)
        if request.query_params.get("include_retired") != "true":
            people = people.filter(is_active=True)
        search = (request.query_params.get("q") or "").strip()
        if search:
            people = people.filter(name__icontains=search)
        people = _with_balances(people)
        if request.query_params.get("owing") == "true":
            people = people.filter(balance_total__gt=0)
        # Whoever owes most, first: the list exists to be worked through. Name
        # breaks the tie so two customers owing the same amount keep a stable
        # order between pages instead of swapping places.
        people = people.order_by("-balance_total", "name")

        limit, offset = parse_page(request.query_params)
        total = people.count()
        rows = [_as_dict(person) for person in people[offset : offset + limit]]

        body = page(rows, total, limit, offset)
        # The headline figure has to cover every customer the filter matched,
        # not the fifty on this page. Summing the visible rows was right while
        # the list was unpaged and would quietly become a lie now.
        body["outstanding_minor"] = str(
            sum(people.values_list("balance_total", flat=True))
        )
        return Response(body)

    def retrieve(self, request, pk=None):
        person = self._scope(request).filter(id=pk).first()
        if person is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown customer."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(_as_dict(person))

    def create(self, request):
        payload = CustomerSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        now = timezone.now()
        person = Customer.objects.create(
            id=data.get("id") or uuid.uuid4(),
            branch=request.user.branch,
            name=data["name"],
            phone=data.get("phone", ""),
            note=data.get("note", ""),
            created_at=now,
            updated_at=now,
        )
        audit.record(
            action=AuditLog.Action.CUSTOMER_CREATED,
            actor=request.user,
            target=person,
            target_label=person.name,
        )
        return Response(_as_dict(person), status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        person = self._scope(request).filter(id=pk).first()
        if person is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown customer."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        payload = CustomerSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        changes = {}
        for field in ("name", "phone", "note", "is_active"):
            if field in data and data[field] != getattr(person, field):
                changes[field] = [getattr(person, field), data[field]]
                setattr(person, field, data[field])
        if changes:
            person.updated_at = timezone.now()
            person.save()
            audit.record(
                action=AuditLog.Action.CUSTOMER_UPDATED,
                actor=request.user,
                target=person,
                target_label=person.name,
                metadata=changes,
            )
        return Response(_as_dict(person))

    def destroy(self, request, pk=None):
        """No hard deletes. Someone who owes money still owes it."""
        person = self._scope(request).filter(id=pk).first()
        if person is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown customer."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        if person.is_active:
            person.retire()
            audit.record(
                action=AuditLog.Action.CUSTOMER_RETIRED,
                actor=request.user,
                target=person,
                target_label=person.name,
            )
        return Response(_as_dict(person))

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        """Every credit sale and every repayment, newest first, with a balance."""
        person = self._scope(request).filter(id=pk).first()
        if person is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown customer."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        charges = [
            {
                "kind": "charge",
                "id": str(payment.id),
                "at": payment.taken_at,
                "amount_minor": str(payment.amount_minor),
                "order_number": payment.order.number,
                "method": "",
                "reference": "",
            }
            for payment in Payment.objects.filter(
                method=Payment.Method.CREDIT, customer_id=person.id
            ).select_related("order")
        ]
        credits = [
            {
                "kind": "settlement",
                "id": str(settlement.id),
                "at": settlement.taken_at,
                "amount_minor": str(settlement.amount_minor),
                "order_number": "",
                "method": settlement.method,
                "reference": settlement.reference,
            }
            for settlement in person.settlements.all()
        ]
        # Newest first. A repayment can land in the same instant as the sale it
        # pays, and then the timestamps tie -- leaving the order to sort
        # stability, which puts the charge first because charges are the first
        # half of the concatenation. On a tie the settlement is necessarily the
        # later event: there is no balance to settle before the charge creating
        # it exists. So rank it above and the statement reads as it happened.
        later_on_a_tie = {"charge": 0, "settlement": 1}
        lines = sorted(
            charges + credits,
            key=lambda row: (row["at"], later_on_a_tie[row["kind"]]),
            reverse=True,
        )

        # A regular customer buying on credit builds a statement without end.
        # The two halves have to be merged before they can be ordered, so the
        # slice happens after the merge rather than in SQL -- bounded by one
        # customer's history, which is the right size to hold in memory.
        limit, offset = parse_page(request.query_params)
        body = page(lines[offset : offset + limit], len(lines), limit, offset)
        body["customer"] = _as_dict(person)
        return Response(body)

    @action(detail=True, methods=["post"])
    def settle(self, request, pk=None):
        """Record a repayment against the account."""
        person = self._scope(request).filter(id=pk).first()
        if person is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown customer."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = SettlementSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        outstanding = _owed(person) - _settled(person)
        if data["amount_minor"] > outstanding:
            # Taking more than is owed would turn the account negative and hide a
            # mistake as credit. Refuse and say what the balance actually is.
            return Response(
                {
                    "error": {
                        "code": "exceeds_balance",
                        "message": "That is more than this customer owes.",
                        "detail": {"balance_minor": str(outstanding)},
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        CustomerSettlement.objects.create(
            id=uuid.uuid4(),
            branch=person.branch,
            customer=person,
            amount_minor=data["amount_minor"],
            method=data["method"],
            reference=data.get("reference", ""),
            note=data.get("note", ""),
            taken_at=now,
            received_by_name=getattr(request.user, "display_name", "")
            or request.user.username,
            created_at=now,
            updated_at=now,
        )
        audit.record(
            action=AuditLog.Action.CUSTOMER_SETTLED,
            actor=request.user,
            target=person,
            target_label=person.name,
            metadata={"amount_minor": str(data["amount_minor"]), "method": data["method"]},
        )
        return Response(_as_dict(person), status=status.HTTP_201_CREATED)
