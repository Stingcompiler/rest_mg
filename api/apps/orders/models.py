"""Orders, lines and payments.

Business rules that live here as well as in the client entities, because the API
must never trust a device that has been tampered with:

- an order may not close while `amount_due > 0`
- a closed order is immutable; a correction is a new reversing record
- credit (آجل / ذمم) settles the balance but is excluded from expected cash
- line name and price are snapshotted at the moment of sale, so a later price
  change never rewrites history
"""
from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class Order(BaseModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        PARKED = "parked", "Parked"
        SENT = "sent", "Sent to kitchen"
        CLOSED = "closed", "Closed"
        VOID = "void", "Void"

    class Type(models.TextChoices):
        DINE_IN = "dine_in", "Dine in"
        TAKEAWAY = "takeaway", "Takeaway"
        DELIVERY = "delivery", "Delivery"

    class KitchenStatus(models.TextChoices):
        """How far along the kitchen is. Deliberately separate from `status`.

        `status` is the *financial* life of the bill and is immutable once
        closed — the cashier owns it. This is the *preparation* life of the
        ticket, and the kitchen owns it. Keeping them apart is what lets a
        kitchen screen mark food ready without ever touching a synced order.
        """

        QUEUED = "queued", "Queued"
        PREPARING = "preparing", "Preparing"
        READY = "ready", "Ready"
        SERVED = "served", "Served"

    class Channel(models.TextChoices):
        """Where the order came from. POS by default; a public web order is
        `online`, which is how the dashboard tells a walk-in from a delivery a
        customer placed themselves."""

        POS = "pos", "Point of sale"
        ONLINE = "online", "Online (public site)"

    class DeliveryStatus(models.TextChoices):
        """The fulfilment life of a delivery order, shown to the customer.

        Only meaningful for online delivery orders; blank for everything else.
        Separate from both `status` (financial) and `kitchen_status` so a
        delivery can be dispatched and delivered without disturbing either.
        """

        PENDING = "pending", "Pending confirmation"
        CONFIRMED = "confirmed", "Confirmed"
        PREPARING = "preparing", "Preparing"
        OUT_FOR_DELIVERY = "out_for_delivery", "Out for delivery"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    number = models.CharField(max_length=32, db_index=True)
    type = models.CharField(max_length=16, choices=Type.choices, default=Type.DINE_IN)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.OPEN, db_index=True
    )
    kitchen_status = models.CharField(
        max_length=16, choices=KitchenStatus.choices, default=KitchenStatus.QUEUED, db_index=True
    )
    kitchen_updated_at = models.DateTimeField(null=True, blank=True)

    # Present and nullable from day one so future modules never force a rewrite.
    table_id = models.UUIDField(null=True, blank=True)
    customer_id = models.UUIDField(null=True, blank=True)

    # Provenance and delivery. All additive and blank by default, so a POS order
    # is exactly as it was; only a public delivery order fills these in.
    channel = models.CharField(
        max_length=16, choices=Channel.choices, default=Channel.POS, db_index=True
    )
    delivery_status = models.CharField(
        max_length=20, choices=DeliveryStatus.choices, blank=True, db_index=True
    )
    customer_name = models.CharField(max_length=120, blank=True)
    customer_phone = models.CharField(max_length=32, blank=True)
    customer_address = models.CharField(max_length=300, blank=True)
    customer_area = models.CharField(max_length=120, blank=True)
    customer_notes = models.CharField(max_length=400, blank=True)

    subtotal_minor = models.BigIntegerField(default=0)
    discount_minor = models.BigIntegerField(default=0)
    total_minor = models.BigIntegerField(default=0)

    opened_at = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    # The cashier is a device-local identity; the server keeps the id and a name
    # snapshot rather than a foreign key it cannot resolve.
    cashier_id = models.UUIDField(null=True, blank=True)
    cashier_name = models.CharField(max_length=80, blank=True)

    shift = models.ForeignKey(
        "shifts.Shift", null=True, blank=True, on_delete=models.PROTECT, related_name="orders"
    )
    # The shift a device says this order belongs to. Orders push during service,
    # the shift only at close, so the row usually arrives first and the foreign
    # key is backfilled when its shift lands. Keeping the claim separate means a
    # batch is never rejected for arriving in the natural order.
    shift_ref = models.UUIDField(null=True, blank=True, db_index=True)
    device = models.ForeignKey(
        "accounts.Device", null=True, blank=True, on_delete=models.PROTECT, related_name="orders"
    )
    void_reason = models.CharField(max_length=240, blank=True)
    corrects = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="corrections"
    )

    class Meta:
        ordering = ["-opened_at"]
        indexes = [
            models.Index(fields=["branch", "status"]),
            models.Index(fields=["shift", "status"]),
        ]

    def __str__(self) -> str:
        return f"#{self.number}"

    @property
    def is_immutable(self) -> bool:
        return self.status in {self.Status.CLOSED, self.Status.VOID}

    @property
    def amount_paid_minor(self) -> int:
        return sum(p.amount_minor for p in self.payments.all())

    @property
    def amount_due_minor(self) -> int:
        return max(self.total_minor - self.amount_paid_minor, 0)

    @property
    def cash_taken_minor(self) -> int:
        """What this order contributed to the drawer. Credit contributes nothing."""
        return sum(
            p.amount_minor for p in self.payments.all() if p.counts_toward_expected_cash
        )


class OrderLine(BaseModel):
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="lines")
    item_id = models.UUIDField(null=True, blank=True)
    name_ar = models.CharField(max_length=160)
    name_en = models.CharField(max_length=160, blank=True)
    unit_price_minor = models.BigIntegerField()
    qty = models.PositiveIntegerField()
    modifiers_text = models.CharField(max_length=240, blank=True)
    line_total_minor = models.BigIntegerField()
    is_void = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=240, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.qty}× {self.name_ar}"


class Payment(BaseModel):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        BANK = "bank", "Bank transfer"
        WALLET = "wallet", "E-wallet"
        CREDIT = "credit", "Credit (آجل)"

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=16, choices=Method.choices)
    amount_minor = models.BigIntegerField()
    tendered_minor = models.BigIntegerField(null=True, blank=True)
    change_minor = models.BigIntegerField(default=0)
    reference = models.CharField(max_length=80, blank=True)
    customer_id = models.UUIDField(null=True, blank=True)
    taken_at = models.DateTimeField()

    class Meta:
        ordering = ["taken_at"]

    def __str__(self) -> str:
        return f"{self.method} {self.amount_minor}"

    @property
    def counts_toward_expected_cash(self) -> bool:
        return self.method == self.Method.CASH

    @property
    def requires_reference(self) -> bool:
        return self.method in {self.Method.BANK, self.Method.WALLET}
