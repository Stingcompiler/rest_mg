"""Human order numbers for website orders.

A number is what a customer reads out on the phone and what the kitchen calls,
so it must not repeat. It continues after the highest numeric number in use —
tills number their own bills, and a website order should not reuse one of
theirs — and the counter row is locked while the next number is taken, so two
orders arriving together cannot both read the same highest number.

Must be called inside a transaction.
"""
from __future__ import annotations

from django.db.models import BigIntegerField, Max
from django.db.models.functions import Cast

from apps.orders.models import Order, OrderNumberCounter

COUNTER = "online"


def next_online_number() -> str:
    OrderNumberCounter.objects.get_or_create(name=COUNTER)
    counter = OrderNumberCounter.objects.select_for_update().get(name=COUNTER)
    highest_in_use = (
        Order.objects.filter(number__regex=r"^[0-9]{1,15}$")
        .annotate(as_number=Cast("number", BigIntegerField()))
        .aggregate(highest=Max("as_number"))["highest"]
        or 0
    )
    counter.value = max(counter.value, highest_in_use) + 1
    counter.save(update_fields=["value"])
    return str(counter.value)
