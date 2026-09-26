"""Shifts and the denomination cash count.

The mockup counts cash by note (٥٠٠٠ · ٢٠٠٠ · ١٠٠٠ · ٥٠٠ · معدن), so the counted
figure is a sum of counted rows, not a single typed number. Both are stored: the
rows for the audit trail, the total for the arithmetic.

Expected cash deliberately excludes credit sales — a customer's ذمم balance is
not money in the drawer, and the shift report says so.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class Shift(BaseModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    name = models.CharField(max_length=80, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.OPEN, db_index=True
    )
    cashier_id = models.UUIDField(null=True, blank=True)
    cashier_name = models.CharField(max_length=80, blank=True)

    opened_at = models.DateTimeField()
    closed_at = models.DateTimeField(null=True, blank=True)

    opening_float_minor = models.BigIntegerField(default=0)
    expected_cash_minor = models.BigIntegerField(default=0)
    counted_cash_minor = models.BigIntegerField(default=0)
    variance_minor = models.BigIntegerField(default=0)
    variance_reason = models.CharField(max_length=240, blank=True)

    device = models.ForeignKey(
        "accounts.Device", null=True, blank=True, on_delete=models.PROTECT, related_name="shifts"
    )

    class Meta:
        ordering = ["-opened_at"]

    def __str__(self) -> str:
        return f"{self.name or 'shift'} {self.opened_at:%Y-%m-%d}"

    def recompute_expected_cash(self) -> int:
        """Opening float plus every cash payment. Credit is excluded by design."""
        taken = sum(order.cash_taken_minor for order in self.orders.all())
        return self.opening_float_minor + taken

    def counted_from_rows(self) -> int:
        return sum(row.line_total_minor for row in self.counts.all())

    @property
    def variance_tolerance_minor(self) -> int:
        return int(abs(self.expected_cash_minor) * settings.SHIFT_VARIANCE_TOLERANCE)

    @property
    def variance_needs_reason(self) -> bool:
        return abs(self.variance_minor) > self.variance_tolerance_minor

    @property
    def has_open_orders(self) -> bool:
        return self.orders.filter(
            status__in=[
                "open",
                "parked",
                "sent",
            ]
        ).exists()

    def blocking_reasons(self) -> list[str]:
        """Why this shift cannot close yet. Empty list means it can."""
        reasons: list[str] = []
        if self.has_open_orders:
            reasons.append("open_orders")
        if self.variance_needs_reason and not self.variance_reason.strip():
            reasons.append("unexplained_variance")
        return reasons


class CashCount(BaseModel):
    """One counted denomination row."""

    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="counts")
    denomination_minor = models.BigIntegerField(null=True, blank=True)  # null = coins/معدن
    label = models.CharField(max_length=32, blank=True)
    count = models.PositiveIntegerField(default=0)
    line_total_minor = models.BigIntegerField(default=0)

    class Meta:
        ordering = ["-denomination_minor"]

    def __str__(self) -> str:
        return f"{self.label or self.denomination_minor} × {self.count}"
