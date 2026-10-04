"""Cancel pickup orders the customer never came for (batch 16).

The same check also runs on its own while the restaurant works (the
deliveries board's poll and the tills' sync, see apps.orders.pickups), so this
command is only needed to run it on a schedule, for instance overnight.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.orders.pickups import PICKUP_WAIT_MINUTES, expire_stale_pickups


class Command(BaseCommand):
    help = "Cancel unpaid pickup orders left ready for longer than --minutes (default 60)."

    def add_arguments(self, parser):
        parser.add_argument("--minutes", type=int, default=PICKUP_WAIT_MINUTES)

    def handle(self, *args, **options):
        cancelled = expire_stale_pickups(options["minutes"])
        self.stdout.write(f"cancelled {cancelled} pickup order(s)")
