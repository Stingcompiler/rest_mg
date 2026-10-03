"""Manager-facing shifts and the revenue report."""
from __future__ import annotations

from collections import defaultdict

from django.db.models import Count, Sum
from rest_framework import status, viewsets
from rest_framework.response import Response

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.permissions import IsManager
from apps.core.query import parse_window
from apps.customers.models import CustomerSettlement
from apps.orders.models import Order, Payment
from apps.shifts.serializers import ShiftReadSerializer


class ShiftViewSet(viewsets.ViewSet):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsManager]

    def list(self, request):
        shifts = ShiftReadSerializer.queryset()
        if request.user.branch_id:
            shifts = shifts.filter(branch_id=request.user.branch_id)
        limit = min(int(request.query_params.get("limit", 60)), 200)
        return Response(ShiftReadSerializer(shifts[:limit], many=True).data)

    def retrieve(self, request, pk=None):
        shift = ShiftReadSerializer.queryset().filter(id=pk).first()
        if shift is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown shift."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(ShiftReadSerializer(shift).data)


class ReportViewSet(viewsets.ViewSet):
    """Aggregates for the manager dashboard.

    Credit (آجل / ذمم) is reported separately and never folded into collected
    revenue — the same distinction the shift report and the cashier's close
    screen make.

    The figures cover the whole flow of money, not only the part that has
    finished moving. Reporting on closed orders alone left three real amounts
    invisible: what has been *ordered but not yet paid* (which now includes every
    online delivery order, since those arrive `sent` and stay that way until a
    cashier settles them), what was *given away as discount*, and what was
    *voided*. A manager reading only "collected" could not tell a quiet day from
    a day with a full kitchen and nothing rung up yet.
    """

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsManager]

    def list(self, request):
        window_from, window_to = parse_window(request.query_params)

        orders = Order.objects.filter(status=Order.Status.CLOSED)
        if request.user.branch_id:
            orders = orders.filter(branch_id=request.user.branch_id)
        if window_from:
            orders = orders.filter(closed_at__gte=window_from)
        if window_to:
            orders = orders.filter(closed_at__lte=window_to)

        payments = Payment.objects.filter(order__in=orders)
        by_method = defaultdict(int)
        for row in payments.values("method").annotate(total=Sum("amount_minor")):
            by_method[row["method"]] = int(row["total"] or 0)

        collected = sum(
            amount for method, amount in by_method.items() if method != Payment.Method.CREDIT
        )
        # --- credit (آجل) ------------------------------------------------------
        # Three different numbers that used to be one (review finding F11): credit
        # given on bills closed in the period; what is still owed at the end of
        # the period — every credit payment up to then, less every repayment up to
        # then; and what customers paid back during the period. A repayment is
        # money received but not a new sale, so it stays out of `collected`.
        credit_sales = by_method.get(Payment.Method.CREDIT, 0)

        credit_given = Payment.objects.filter(method=Payment.Method.CREDIT)
        repaid = CustomerSettlement.objects.all()
        if request.user.branch_id:
            credit_given = credit_given.filter(branch_id=request.user.branch_id)
            repaid = repaid.filter(branch_id=request.user.branch_id)
        if window_to:
            credit_given = credit_given.filter(taken_at__lte=window_to)
            repaid_until_end = repaid.filter(taken_at__lte=window_to)
        else:
            repaid_until_end = repaid
        credit_outstanding = int(
            credit_given.aggregate(total=Sum("amount_minor"))["total"] or 0
        ) - int(repaid_until_end.aggregate(total=Sum("amount_minor"))["total"] or 0)

        repaid_in_period = repaid
        if window_from:
            repaid_in_period = repaid_in_period.filter(taken_at__gte=window_from)
        if window_to:
            repaid_in_period = repaid_in_period.filter(taken_at__lte=window_to)
        settlements_by_method = {
            row["method"]: int(row["total"] or 0)
            for row in repaid_in_period.values("method").annotate(total=Sum("amount_minor"))
        }

        summary = orders.aggregate(
            order_count=Count("id"), gross=Sum("total_minor"), discount=Sum("discount_minor")
        )
        order_count = summary["order_count"] or 0
        gross = int(summary["gross"] or 0)
        discount = int(summary["discount"] or 0)

        by_type = {
            row["type"]: row["count"]
            for row in orders.values("type").annotate(count=Count("id"))
        }
        # The same split by money, not only by how many. A dozen small takeaways
        # and one large delivery are the same number on a count.
        by_type_minor = {
            row["type"]: str(int(row["total"] or 0))
            for row in orders.values("type").annotate(total=Sum("total_minor"))
        }
        by_channel_minor = {
            row["channel"]: str(int(row["total"] or 0))
            for row in orders.values("channel").annotate(total=Sum("total_minor"))
        }

        # --- money that has not finished moving --------------------------------
        # Orders taken but not settled: open and parked bills on the floor, and
        # every online delivery awaiting a cashier. This is owed to the
        # restaurant and was previously absent from the dashboard entirely.
        live = Order.objects.filter(
            status__in=[Order.Status.OPEN, Order.Status.PARKED, Order.Status.SENT]
        )
        if request.user.branch_id:
            live = live.filter(branch_id=request.user.branch_id)
        live_summary = live.aggregate(count=Count("id"), total=Sum("total_minor"))
        unpaid_count = live_summary["count"] or 0
        unpaid = int(live_summary["total"] or 0)
        pending_delivery = live.filter(
            channel=Order.Channel.ONLINE,
            delivery_status__in=[
                Order.DeliveryStatus.PENDING,
                Order.DeliveryStatus.CONFIRMED,
                Order.DeliveryStatus.PREPARING,
                Order.DeliveryStatus.OUT_FOR_DELIVERY,
            ],
        ).count()

        # --- money that went away ---------------------------------------------
        voided = Order.objects.filter(status=Order.Status.VOID)
        if request.user.branch_id:
            voided = voided.filter(branch_id=request.user.branch_id)
        if window_from:
            voided = voided.filter(opened_at__gte=window_from)
        if window_to:
            voided = voided.filter(opened_at__lte=window_to)
        void_summary = voided.aggregate(count=Count("id"), total=Sum("total_minor"))

        return Response(
            {
                "order_count": order_count,
                "gross_minor": str(gross),
                "collected_minor": str(collected),
                "credit_outstanding_minor": str(credit_outstanding),
                "credit_sales_minor": str(credit_sales),
                "settlements_minor": str(sum(settlements_by_method.values())),
                "settlements_by_method": {
                    method: str(total) for method, total in settlements_by_method.items()
                },
                "average_ticket_minor": str(gross // order_count if order_count else 0),
                "by_method": {method: str(total) for method, total in by_method.items()},
                "by_type": by_type,
                # --- additive: the rest of the flow ---
                "discount_minor": str(discount),
                "by_type_minor": by_type_minor,
                "by_channel_minor": by_channel_minor,
                "unpaid_order_count": unpaid_count,
                "unpaid_minor": str(unpaid),
                "pending_delivery_count": pending_delivery,
                "void_order_count": void_summary["count"] or 0,
                "void_minor": str(int(void_summary["total"] or 0)),
            }
        )
