"""Cancel pickup orders the customer never came for (batch 16).

A pickup left ready for an hour is food nobody collected. Run this every few
minutes (a cron job, or Render's cron service): it voids an unpaid pickup that
has waited past the limit, with the reason "لم يحضر الزبون", and records it in
the activity log. Money already taken is never voided by a timer; that one is
left for a person to deal with.
"""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.audit.models import AuditLog
from apps.orders.models import Order

NO_SHOW_REASON = "لم يحضر الزبون"


class Command(BaseCommand):
    help = "Cancel unpaid pickup orders left ready for longer than --minutes (default 60)."

    def add_arguments(self, parser):
        parser.add_argument("--minutes", type=int, default=60)

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(minutes=options["minutes"])
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
                order.save(update_fields=["delivery_status", "status", "void_reason", "closed_at", "updated_at", "server_updated_at"])
                audit.record(
                    action=AuditLog.Action.DELIVERY_STATUS,
                    actor=None,
                    target=order,
                    target_label=f"#{order.number}",
                    metadata={"delivery_status": ["ready_for_pickup", "cancelled"], "reason": NO_SHOW_REASON},
                )
                cancelled += 1
        self.stdout.write(f"cancelled {cancelled} pickup order(s)")
