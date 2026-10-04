"""Manager-facing orders. Read-only by design — with one deliberate exception.

The server never edits an *order*: it is a record of something that already
happened on a tablet. Corrections arrive from the device as new reversing
records, which is why there is no update or destroy here.

The one thing that does change server-side is a delivery order's **fulfilment
status**, and it is split by who actually knows the answer:

  front-of-house   pending → confirmed → out for delivery → delivered
  the kitchen      → preparing (mirrored from `kitchen_status`)
  either           → cancelled, while the order is still live

That is not the order's financial record (still immutable); it is the same kind
of separate lifecycle as `kitchen_status`, owned here because a public delivery
order has no till to own it. Front-of-house never sets `preparing`: cooking is
the kitchen's work, the kitchen already reports it, and asking a cashier to
assert it would be asking them to report on a room they cannot see.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.permissions import IsManager, IsOrderProcessor
from apps.audit import services as audit
from apps.audit.models import AuditLog
from apps.core.query import page, parse_page, parse_window
from apps.core.scoping import visible
from apps.orders.models import Order
from apps.orders.serializers import OrderReadSerializer

# The fulfilment flow, and what front-of-house may move it to.
#
# Note what is *absent*: nobody here may set `preparing`. Cooking is the
# kitchen's work and the kitchen already owns a lifecycle for it
# (`kitchen_status`), so a delivery enters and leaves `preparing` as a
# consequence of what the kitchen actually does — see KITCHEN_TO_DELIVERY below.
# Front-of-house confirms the order, sends it out, and closes it; it never
# asserts that food is ready. Cancellation is allowed from any live state; the
# two terminal states go nowhere.
DELIVERY_TRANSITIONS = {
    Order.DeliveryStatus.PENDING: {Order.DeliveryStatus.CONFIRMED, Order.DeliveryStatus.CANCELLED},
    Order.DeliveryStatus.CONFIRMED: {
        Order.DeliveryStatus.OUT_FOR_DELIVERY,
        Order.DeliveryStatus.CANCELLED,
    },
    Order.DeliveryStatus.PREPARING: {
        Order.DeliveryStatus.OUT_FOR_DELIVERY,
        Order.DeliveryStatus.CANCELLED,
    },
    Order.DeliveryStatus.OUT_FOR_DELIVERY: {
        Order.DeliveryStatus.DELIVERED,
        Order.DeliveryStatus.CANCELLED,
    },
    Order.DeliveryStatus.DELIVERED: set(),
    Order.DeliveryStatus.CANCELLED: set(),
}

# Statuses front-of-house may never set by hand, because they are statements
# about the kitchen rather than about the delivery.
KITCHEN_OWNED_DELIVERY_STATUSES = {Order.DeliveryStatus.PREPARING}

# Sending the food out is front-of-house's move, but it is also a claim that
# there is food to send — and only the kitchen can make that claim. Until the
# ticket is ready (or already handed over), it is the kitchen's turn, not the
# cashier's. Without this the two roles overlap: the cashier could dispatch a
# rider while the order was still being cooked, which is exactly the sort of
# thing nobody notices until a customer receives nothing.
KITCHEN_READY_STATUSES = {Order.KitchenStatus.READY, Order.KitchenStatus.SERVED}


class OrderViewSet(viewsets.ViewSet):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsManager]

    def get_permissions(self):
        # The full order list — with every POS order's financials — is a
        # manager's. The delivery-only view and advancing a delivery's status are
        # also the cashier's job, so those two widen the audience by a role.
        if self.action in {"delivery_status", "deliveries"}:
            return [IsOrderProcessor()]
        return [IsManager()]

    @action(detail=False, methods=["get"], url_path="deliveries")
    def deliveries(self, request):
        """Online delivery orders only — the cashier's processing queue.

        A separate action so widening access to the cashier never exposes the
        full order list. Scoped to the branch, newest first.
        """
        orders = OrderReadSerializer.queryset().filter(channel=Order.Channel.ONLINE)
        if request.user.branch_id:
            orders = orders.filter(branch_id=request.user.branch_id)
        orders = orders.order_by("-created_at")
        limit, offset = parse_page(request.query_params, default=50, maximum=200)
        total = orders.count()
        rows = OrderReadSerializer(orders[offset : offset + limit], many=True).data
        return Response(page(rows, total, limit, offset))

    @action(detail=True, methods=["post"], url_path="delivery-status")
    def delivery_status(self, request, pk=None):
        """Advance (or cancel) a delivery order's fulfilment status."""
        order = visible(Order.objects, request.user).filter(id=pk).first()
        if order is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown order."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not order.delivery_status:
            return Response(
                {"error": {"code": "not_a_delivery", "message": "This is not a delivery order."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target = request.data.get("delivery_status")
        valid = {s.value for s in Order.DeliveryStatus}
        if target not in valid:
            return Response(
                {"error": {"code": "validation_error", "message": "Unknown delivery status."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target in KITCHEN_OWNED_DELIVERY_STATUSES:
            # "Preparing" is the kitchen saying it started cooking. Front-of-house
            # asserting it would be reporting work it cannot see.
            return Response(
                {
                    "error": {
                        "code": "kitchen_owned_status",
                        "message": "Preparation status is set by the kitchen, not here.",
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )
        if (
            target == Order.DeliveryStatus.OUT_FOR_DELIVERY
            and order.kitchen_status not in KITCHEN_READY_STATUSES
        ):
            return Response(
                {
                    "error": {
                        "code": "kitchen_not_ready",
                        "message": "The kitchen has not marked this order ready.",
                        "detail": {"kitchen_status": order.kitchen_status},
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )
        if target != order.delivery_status and target not in DELIVERY_TRANSITIONS[order.delivery_status]:
            return Response(
                {
                    "error": {
                        "code": "invalid_transition",
                        "message": f"Cannot move from {order.delivery_status} to {target}.",
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )

        # Cancelling is a decision about the money as much as the delivery
        # (review finding F06). An unpaid order is voided, which takes it off the
        # kitchen board and out of the unpaid total. Money already taken has to
        # go back first, and there is no refund flow yet — so that is refused
        # rather than leaving a paid bill marked cancelled.
        cancelling = target == Order.DeliveryStatus.CANCELLED and target != order.delivery_status
        # A customer's order is not dropped without saying why: the reason is
        # what the activity log shows, and what the restaurant tells the
        # customer when they call (user-experience review, batch 11).
        reason = str(request.data.get("reason") or "").strip()[:200]
        if cancelling and not reason:
            return Response(
                {
                    "error": {
                        "code": "reason_required",
                        "message": "Say why this order is being cancelled.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if cancelling and order.payments.exists():
            return Response(
                {
                    "error": {
                        "code": "paid_order_cancel",
                        "message": "This order has been paid; refund it before cancelling.",
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )

        if target != order.delivery_status:
            previous = order.delivery_status
            now = timezone.now()
            order.delivery_status = target
            order.updated_at = now
            written = ["delivery_status", "updated_at", "server_updated_at"]
            if cancelling:
                order.status = Order.Status.VOID
                order.closed_at = now
                order.void_reason = reason
                written += ["status", "closed_at", "void_reason"]
            order.save(update_fields=written)
            audit.record(
                action=AuditLog.Action.DELIVERY_STATUS,
                actor=request.user,
                target=order,
                target_label=f"#{order.number}",
                metadata={
                    "delivery_status": [previous, target],
                    **({"reason": reason} if cancelling else {}),
                },
            )
        return Response(OrderReadSerializer(OrderReadSerializer.queryset().get(id=pk)).data)

    def list(self, request):
        orders = OrderReadSerializer.queryset()
        if request.user.branch_id:
            orders = orders.filter(branch_id=request.user.branch_id)
        if request.query_params.get("status"):
            orders = orders.filter(status=request.query_params["status"])
        if request.query_params.get("channel"):
            orders = orders.filter(channel=request.query_params["channel"])
        if request.query_params.get("shift"):
            orders = orders.filter(shift_ref=request.query_params["shift"])
        window_from, window_to = parse_window(request.query_params)
        if window_from:
            orders = orders.filter(opened_at__gte=window_from)
        if window_to:
            # Half-open like the revenue report: from <= opened_at < to.
            orders = orders.filter(opened_at__lt=window_to)

        limit, offset = parse_page(request.query_params, default=50, maximum=500)
        total = orders.count()
        rows = OrderReadSerializer(orders[offset : offset + limit], many=True).data
        return Response(page(rows, total, limit, offset))

    def retrieve(self, request, pk=None):
        order = visible(OrderReadSerializer.queryset(), request.user).filter(id=pk).first()
        if order is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown order."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(OrderReadSerializer(order).data)
