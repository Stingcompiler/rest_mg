"""The kitchen display's API.

The kitchen runs on its own screen, so unlike the cashier it is an **online**
surface: it reads tickets from the server rather than from a local database. The
printed ticket remains the offline guarantee — if the network is down the
kitchen still gets paper, and this screen simply has nothing new to show.

What the kitchen owns is `kitchen_status`, and only that. The financial life of
the bill (`status`, totals, payments) belongs to the cashier and is never
touched here, which is how a ticket can be marked ready without ever mutating a
synced order.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.permissions import IsKitchen
from apps.orders.models import Order

# A ticket leaves the board once the kitchen has served it. A voided order
# disappears immediately — the food is cancelled.
ACTIVE_KITCHEN_STATUSES = [
    Order.KitchenStatus.QUEUED,
    Order.KitchenStatus.PREPARING,
    Order.KitchenStatus.READY,
]


def _ticket(order: Order) -> dict:
    return {
        "id": str(order.id),
        "number": order.number,
        "type": order.type,
        "status": order.status,
        "kitchen_status": order.kitchen_status,
        "table_id": str(order.table_id) if order.table_id else None,
        "cashier_name": order.cashier_name,
        # The kitchen cares when the food was ordered, not when the bill closed.
        "sent_at": order.sent_at or order.opened_at,
        "lines": [
            {
                "id": str(line.id),
                "name_ar": line.name_ar,
                "name_en": line.name_en,
                "qty": line.qty,
                "modifiers_text": line.modifiers_text,
            }
            for line in order.lines.all()
            if not line.is_void
        ],
    }


class KitchenViewSet(viewsets.ViewSet):
    """Explicit ViewSet, hand-written actions — as everywhere in this project."""

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsKitchen]

    def list(self, request):
        """Every ticket still on the pass, oldest first — the board's order."""
        orders = (
            Order.objects.filter(
                status__in=[Order.Status.SENT, Order.Status.CLOSED],
                kitchen_status__in=ACTIVE_KITCHEN_STATUSES,
            )
            .prefetch_related("lines")
            .order_by("sent_at", "opened_at")
        )
        if request.user.branch_id:
            orders = orders.filter(branch_id=request.user.branch_id)

        return Response({"tickets": [_ticket(order) for order in orders[:100]]})

    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        """Advance a ticket: queued → preparing → ready → served."""
        new_status = request.data.get("kitchen_status")
        if new_status not in Order.KitchenStatus.values:
            return Response(
                {
                    "error": {
                        "code": "validation_error",
                        "message": f"kitchen_status must be one of {Order.KitchenStatus.values}.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = Order.objects.filter(id=pk).prefetch_related("lines").first()
        if order is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown ticket."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        order.kitchen_status = new_status
        order.kitchen_updated_at = timezone.now()
        written = ["kitchen_status", "kitchen_updated_at", "server_updated_at"]

        # A customer's delivery order shows a fulfilment status on the
        # front-of-house board, and "preparing" on that board means precisely
        # "the kitchen started cooking". So the kitchen sets it, here, as a
        # consequence of its own work — nobody re-types it from another screen.
        # Only that one step is mirrored: dispatching and delivering are
        # front-of-house's to report, and a cancelled order is left alone.
        if (
            order.channel == Order.Channel.ONLINE
            and new_status == Order.KitchenStatus.PREPARING
            and order.delivery_status
            in {Order.DeliveryStatus.PENDING, Order.DeliveryStatus.CONFIRMED}
        ):
            order.delivery_status = Order.DeliveryStatus.PREPARING
            written.append("delivery_status")

        # Only the kitchen's own columns are written — the bill is untouched.
        order.save(update_fields=written)
        return Response(_ticket(order))
