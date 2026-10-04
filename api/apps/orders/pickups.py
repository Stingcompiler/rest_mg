"""Pickup orders the customer never came for (batches 16 and 17).

A pickup left ready for an hour is food nobody collected. It is voided, unpaid,
with the reason "لم يحضر الزبون" and an activity-log entry. Money already taken
is never voided by a timer.

There is no scheduler to run this: a cron job on Render is a separate paid
service. So besides the `expire_pickups` command, the check rides the requests
the restaurant already makes (the deliveries board's poll and every till's
sync), at most once a minute.
"""
from __future__ import annotations

from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.audit.models import AuditLog
from apps.orders.models import Order

NO_SHOW_REASON = "لم يحضر الزبون"
PICKUP_WAIT_MINUTES = 60
_CHECK_KEY = "orders:pickup-expiry-checked"
_CHECK_EVERY_SECONDS = 60


def expire_stale_pickups(minutes: int = PICKUP_WAIT_MINUTES) -> int:
    """Void every unpaid pickup left ready longer than `minutes`. Returns how many."""
    cutoff = timezone.now() - timedelta(minutes=minutes)
    stale = Order.objects.filter(
        channel=Order.Channel.ONLINE,
        type=Order.Type.TAKEAWAY,
        delivery_status=Order.DeliveryStatus.READY_FOR_PICKUP,
        kitchen_updated_at__lt=cutoff,
        payments__isnull=True,
    ).distinct()
    cancelled = 0
    for order in stale:
        with transaction.atomic():
            now = timezone.now()
            order.delivery_status = Order.DeliveryStatus.CANCELLED
            order.status = Order.Status.VOID
            order.void_reason = NO_SHOW_REASON
            order.closed_at = now
            order.updated_at = now
            order.save(
                update_fields=["delivery_status", "status", "void_reason", "closed_at", "updated_at", "server_updated_at"]
            )
            audit.record(
                action=AuditLog.Action.DELIVERY_STATUS,
                actor=None,
                target=order,
                target_label=f"#{order.number}",
                metadata={"delivery_status": ["ready_for_pickup", "cancelled"], "reason": NO_SHOW_REASON},
            )
            cancelled += 1
    return cancelled


def maybe_expire_pickups() -> None:
    """Run the check if nobody has in the last minute. Cheap enough to call on a poll."""
    # cache.add only sets the key when it is absent, so one caller a minute wins.
    if cache.add(_CHECK_KEY, True, _CHECK_EVERY_SECONDS):
        expire_stale_pickups()
