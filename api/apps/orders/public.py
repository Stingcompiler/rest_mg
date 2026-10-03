"""The public delivery-order endpoint.

A visitor on the landing page places an order without signing in. This is the
one place an order is born on the server rather than synced from a till, so it
is also where the server does the work a till would otherwise have done — and
does not trust a byte of pricing from the browser.

Every guarantee the brief asks for lives here:

- **The price is the database's, never the client's.** The request carries only
  item ids and quantities; the name and unit price are read from `MenuItem` and
  snapshotted onto the line, exactly as the POS snapshots at the moment of sale.
- **Unavailable or unknown items cannot be ordered.** Each id must resolve to an
  active, available item on the published branch, or the whole order is refused.
- **The total is computed here** and returned, so the confirmation shows a number
  the server stands behind.
- **A retried submission is the same order.** The page sends an Idempotency-Key
  per checkout attempt; sending it again returns the order it already created.
- **Limited.** Per phone number and per address (apps.orders.throttles), and no
  more than MAX_LINES lines.

The resulting order is an ordinary `Order` — `type=delivery`, `status=sent`,
`kitchen_status=queued` — so it lands on the kitchen board and in the dashboard's
order list through the paths that already exist, with `channel=online` and a
`delivery_status` of `pending` marking it as a customer's own delivery request.
"""
from __future__ import annotations

import uuid

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import MenuItem
from apps.core.scoping import in_branch_or_shared
from apps.orders.models import Order, OrderLine
from apps.orders.numbers import next_online_number
from apps.orders.throttles import PUBLIC_ORDER_THROTTLES
from apps.profiles.models import RestaurantProfile

MAX_LINES = 50


class _LineInput(serializers.Serializer):
    item_id = serializers.UUIDField()
    qty = serializers.IntegerField(min_value=1, max_value=99)


class PublicOrderSerializer(serializers.Serializer):
    """Only what a customer supplies: who they are, and what they want. No
    prices — those are the server's to decide."""

    customer_name = serializers.CharField(max_length=120)
    customer_phone = serializers.CharField(max_length=32)
    customer_address = serializers.CharField(max_length=300)
    customer_area = serializers.CharField(max_length=120, required=False, allow_blank=True)
    customer_notes = serializers.CharField(max_length=400, required=False, allow_blank=True)
    # Which restaurant's page the order came from (/r/<slug>). Required only
    # when more than one page is published.
    slug = serializers.SlugField(max_length=80, required=False)
    items = _LineInput(many=True, max_length=MAX_LINES)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("An order needs at least one item.")
        return value


def _confirmation(order: Order) -> dict:
    return {
        "id": str(order.id),
        "number": order.number,
        "total_minor": str(order.total_minor),
        "delivery_status": order.delivery_status,
        "item_count": sum(line.qty for line in order.lines.all()),
    }


def _idempotency_key(request):
    """The checkout attempt's key: a UUID, absent, or invalid (raises)."""
    raw = request.headers.get("Idempotency-Key")
    if raw is None:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        raise serializers.ValidationError({"idempotency_key": "Must be a UUID."})


class PublicOrderView(APIView):
    """`POST /api/v1/public/order/` — place a delivery order. No auth."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = PUBLIC_ORDER_THROTTLES

    def post(self, request):
        key = _idempotency_key(request)
        if key is not None:
            placed = Order.objects.filter(client_request_id=key).prefetch_related("lines").first()
            if placed is not None:
                return Response(_confirmation(placed), status=status.HTTP_200_OK)

        payload = PublicOrderSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        # Orders are only accepted while the page is actually published — and go
        # to the restaurant whose page it is. With several published, an order
        # that does not say which is refused rather than sent to whichever
        # happens to come first.
        published = RestaurantProfile.objects.filter(landing_page_enabled=True)
        if data.get("slug"):
            profile = published.filter(slug=data["slug"]).first()
        elif published.count() > 1:
            return Response(
                {
                    "error": {
                        "code": "restaurant_required",
                        "message": "Say which restaurant this order is for.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        else:
            profile = published.first()
        if profile is None:
            return Response(
                {"error": {"code": "not_found", "message": "Online ordering is not available."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        # Publishing the page does not open ordering; the manager does that
        # separately. Enforced here, not only on the page, so a stale page or a
        # direct call cannot place an order while it is closed.
        if not profile.online_ordering_enabled:
            return Response(
                {
                    "error": {
                        "code": "online_ordering_closed",
                        "message": "The restaurant is not taking online orders right now.",
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )
        branch_scope = Q() if profile.branch_id is None else in_branch_or_shared(profile.branch_id)

        # Resolve every line against the live menu. Price and name come from the
        # database row, not the request.
        requested = data["items"]
        wanted_ids = [str(line["item_id"]) for line in requested]
        items = {
            str(item.id): item
            for item in MenuItem.objects.filter(
                branch_scope,
                id__in=wanted_ids,
                is_active=True,
                is_available=True,
                # The category must still be live too. An item under a retired
                # category is not on the public menu, so it must not be
                # orderable either — otherwise a stale cart (or a crafted
                # request) could buy something the restaurant has taken off.
                category__is_active=True,
            )
        }

        now = timezone.now()
        lines: list[dict] = []
        subtotal = 0
        for line in requested:
            item = items.get(str(line["item_id"]))
            if item is None:
                # Unknown, retired, unavailable, or another branch's — refuse the
                # whole order rather than silently dropping a line.
                return Response(
                    {
                        "error": {
                            "code": "item_unavailable",
                            "message": "One or more items are no longer available.",
                            "detail": {"item_id": str(line["item_id"])},
                        }
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            qty = line["qty"]
            line_total = item.price_minor * qty
            subtotal += line_total
            lines.append(
                {
                    "item": item,
                    "qty": qty,
                    "unit_price_minor": item.price_minor,
                    "line_total_minor": line_total,
                    "name_ar": item.name_ar,
                    "name_en": item.name_en,
                }
            )

        try:
            with transaction.atomic():
                order = self._create(profile, data, lines, subtotal, now, key)
        except IntegrityError:
            # The same attempt arrived twice at once and the other one won.
            placed = Order.objects.filter(client_request_id=key).first() if key else None
            if placed is None:
                raise
            return Response(_confirmation(placed), status=status.HTTP_200_OK)

        return Response(_confirmation(order), status=status.HTTP_201_CREATED)

    @staticmethod
    def _create(profile, data, lines, subtotal, now, key) -> Order:
        """Write the order and its lines. Called inside the caller's transaction,
        which the order number's lock (next_online_number) relies on."""
        order = Order.objects.create(
            id=uuid.uuid4(),
            branch=profile.branch,
            number=next_online_number(),
            client_request_id=key,
            type=Order.Type.DELIVERY,
            status=Order.Status.SENT,
            kitchen_status=Order.KitchenStatus.QUEUED,
            channel=Order.Channel.ONLINE,
            delivery_status=Order.DeliveryStatus.PENDING,
            customer_name=data["customer_name"],
            customer_phone=data["customer_phone"],
            customer_address=data["customer_address"],
            customer_area=data.get("customer_area", ""),
            customer_notes=data.get("customer_notes", ""),
            subtotal_minor=subtotal,
            discount_minor=0,
            total_minor=subtotal,
            opened_at=now,
            sent_at=now,
            created_at=now,
            updated_at=now,
        )
        for line in lines:
            OrderLine.objects.create(
                id=uuid.uuid4(),
                branch=profile.branch,
                order=order,
                item_id=line["item"].id,
                name_ar=line["name_ar"],
                name_en=line["name_en"],
                unit_price_minor=line["unit_price_minor"],
                qty=line["qty"],
                line_total_minor=line["line_total_minor"],
                created_at=now,
                updated_at=now,
            )
        return order
