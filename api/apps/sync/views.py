"""The two endpoints the cashier tablet talks to. Both are background work.

Nothing here is on an interactive path: the tablet reads and writes IndexedDB and
paints from it. These endpoints exist so that, when a connection happens to be
available, finished work travels up and menu changes travel down.
"""
from __future__ import annotations

import logging

from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.authentication import CookieJWTAuthentication, DeviceAuthentication
from apps.accounts.models import Device
from apps.accounts.permissions import IsSyncPrincipal
from apps.catalog.models import Category, MenuItem
from apps.customers.models import Customer
from apps.orders.models import Order
from apps.catalog.serializers import CategorySerializer, MenuItemSerializer
from apps.profiles.models import RestaurantProfile
from apps.profiles.serializers import RestaurantProfileSerializer
from apps.sync.serializers import PushEnvelopeSerializer, PushRecordSerializer
from apps.sync.services import ACCEPTED, REJECTED, RecordResult, apply_record

# A refused record stays on the device until someone looks at the till's sync
# screen. Logging it here means the server's logs show it too, so a till that
# keeps sending something the server will not take is noticed from outside.
logger = logging.getLogger("sudanpos.sync")


class SyncViewSet(viewsets.ViewSet):
    # Either principal is accepted: an enrolled tablet's device token, or a
    # signed-in cashier's cookie. The token is tried first so an unattended
    # device keeps working with nobody logged in.
    authentication_classes = [DeviceAuthentication, CookieJWTAuthentication]
    permission_classes = [IsSyncPrincipal]

    @staticmethod
    def _principal(request):
        """Split the caller into (device, branch).

        A device carries both; a signed-in cashier carries only a branch. The
        writers need them apart, because `device` is a foreign key and a person
        is not a device.
        """
        principal = request.user
        device = principal if isinstance(principal, Device) else None
        return device, getattr(principal, "branch", None)

    @action(detail=False, methods=["post"])
    def push(self, request):
        """Accept a batch of finished records. Idempotent by record uuid."""
        envelope = PushEnvelopeSerializer(data=request.data)
        envelope.is_valid(raise_exception=True)

        device, branch = self._principal(request)

        results = []
        for raw in envelope.validated_data["records"]:
            # One record's problem is that record's problem. Anything else in
            # the batch — an order carrying the day's takings, say — still lands.
            record = PushRecordSerializer(data=raw)
            if not record.is_valid():
                results.append(
                    RecordResult(
                        id=str(raw.get("id", "")),
                        status=REJECTED,
                        reason=record.errors,
                    )
                )
                continue
            results.append(apply_record(record.validated_data, device, branch))
        if device:
            device.touch()

        for result in results:
            if result.status == REJECTED:
                logger.warning(
                    "sync record rejected: id=%s device=%s branch=%s reason=%s",
                    result.id,
                    getattr(device, "id", None),
                    getattr(branch, "id", None),
                    result.reason,
                )

        accepted = sum(1 for r in results if r.status == ACCEPTED)
        rejected = sum(1 for r in results if r.status == REJECTED)
        return Response(
            {
                "batch_id": str(envelope.validated_data["batch_id"]),
                "server_time": timezone.now(),
                "accepted": accepted,
                "rejected": rejected,
                "duplicates": len(results) - accepted - rejected,
                "results": [r.as_dict() for r in results],
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"])
    def pull(self, request):
        """Menu and settings deltas since a cursor.

        The cursor is the *server's* clock, never the device's. Tablets are
        offline for days and their clocks drift; filtering on a device timestamp
        would silently skip rows.
        """
        since_raw = request.query_params.get("since")
        since = None
        if since_raw:
            since = serializers.DateTimeField().to_internal_value(since_raw)

        cursor = timezone.now()
        branch_id = getattr(request.user, "branch_id", None)

        categories = Category.objects.filter(server_updated_at__lte=cursor)
        items = MenuItem.objects.filter(server_updated_at__lte=cursor)
        profiles = RestaurantProfile.objects.filter(server_updated_at__lte=cursor)
        # Customers come down too: a credit sale must name who owes it, and the
        # till takes credit with the line down as readily as with it up.
        customers = Customer.objects.filter(server_updated_at__lte=cursor)

        if branch_id:
            categories = categories.filter(branch_id__in=[branch_id, None])
            items = items.filter(branch_id__in=[branch_id, None])
            profiles = profiles.filter(branch_id__in=[branch_id, None])
            customers = customers.filter(branch_id__in=[branch_id, None])

        if since is not None:
            categories = categories.filter(server_updated_at__gt=since)
            items = items.filter(server_updated_at__gt=since)
            customers = customers.filter(server_updated_at__gt=since)
        # The profile is one small row and every receipt prints its name, so it
        # comes down on every pull rather than only when it changed: a till that
        # synced before it kept the profile still gets it on its next run.

        pending_deliveries = Order.objects.filter(
            channel=Order.Channel.ONLINE,
            delivery_status=Order.DeliveryStatus.PENDING,
        ).order_by("-created_at")
        if branch_id:
            pending_deliveries = pending_deliveries.filter(branch_id=branch_id)
        # A till does not need to know about the hundredth one; it needs to know
        # that somebody is waiting.
        pending_deliveries = pending_deliveries[:50]

        payload = {
            "cursor": cursor,
            "full_snapshot": since is None,
            "categories": [
                {**CategorySerializer(c).data, "server_updated_at": c.server_updated_at}
                for c in categories
            ],
            "items": [
                {
                    **MenuItemSerializer(i).data,
                    "category_id": str(i.category_id),
                    "server_updated_at": i.server_updated_at,
                }
                for i in items.select_related("category")
            ],
            "customers": [
                {
                    "id": str(c.id),
                    "name": c.name,
                    "phone": c.phone,
                    "is_active": c.is_active,
                    "server_updated_at": c.server_updated_at,
                }
                for c in customers
            ],
            "profile": (
                RestaurantProfileSerializer(profiles.first()).data if profiles.exists() else None
            ),
            # Customer orders waiting to be confirmed.
            #
            # Not a sync of orders — orders travel *up* from the till and this
            # does not change that. It is a signal, deliberately as small as one
            # can be: the ids of what is waiting, so the till can say "three
            # customers are waiting" without ever fetching an order.
            #
            # Current state rather than a delta: a badge has to be right on
            # every run, and a delta would leave a till that missed one poll
            # showing nothing at all.
            "pending_deliveries": [
                {"id": str(order.id), "number": order.number}
                for order in pending_deliveries
            ],
        }
        device, _ = self._principal(request)
        if device:
            device.touch()
        return Response(payload)
