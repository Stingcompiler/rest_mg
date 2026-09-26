"""Menu structure and price history.

Direction of travel (decision 3 in docs/PLAN.md): the manager dashboard is
authoritative for *structure* — creating categories and items, retiring them.
The cashier tablet may change *price* and *availability* offline, and those edits
push up in the same sync envelope as orders. Conflicts resolve last-writer-wins
on `updated_at`, and every price movement leaves a `PriceChange` row, so a
losing edit is still visible in the audit trail rather than lost.
"""
from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class Category(BaseModel):
    name_ar = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120, blank=True)
    sort = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort", "name_ar"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name_ar


class MenuItem(BaseModel):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="items")
    name_ar = models.CharField(max_length=160)
    name_en = models.CharField(max_length=160, blank=True)
    description_ar = models.CharField(max_length=240, blank=True)
    description_en = models.CharField(max_length=240, blank=True)
    price_minor = models.BigIntegerField()
    is_available = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    # A featured item — the "الأكثر طلبًا / المميّزة" shelf on the landing page.
    # The manager curates it; orthogonal to availability and category.
    is_featured = models.BooleanField(default=False, db_index=True)
    # An uploaded photo. Optional: an item without one still sells, and the
    # frontend falls back to a placeholder rather than a broken image.
    image = models.ImageField(upload_to="menu-items/", null=True, blank=True)
    sort = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort", "name_ar"]
        indexes = [models.Index(fields=["category", "is_active"])]

    def __str__(self) -> str:
        return self.name_ar

    def retire(self) -> None:
        """No hard deletes: an item leaves the menu by going inactive."""
        self.is_active = False
        self.save(update_fields=["is_active", "updated_at", "server_updated_at"])


class PriceChange(BaseModel):
    """Append-only price history. A bulk % change emits one row per item."""

    class Reason(models.TextChoices):
        MANUAL = "manual", "Manual edit"
        BULK_PERCENT = "bulk_percent", "Bulk percentage change"
        SYNC = "sync", "Applied from server"

    item = models.ForeignKey(MenuItem, on_delete=models.PROTECT, related_name="price_changes")
    old_price_minor = models.BigIntegerField()
    new_price_minor = models.BigIntegerField()
    reason = models.CharField(max_length=16, choices=Reason.choices, default=Reason.MANUAL)
    percent = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    source_device = models.ForeignKey(
        "accounts.Device", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    applied_at = models.DateTimeField()

    class Meta:
        ordering = ["-applied_at"]

    def __str__(self) -> str:
        return f"{self.item.name_ar}: {self.old_price_minor} → {self.new_price_minor}"
