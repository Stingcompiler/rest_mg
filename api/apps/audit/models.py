"""The activity log.

A small, append-only record of the meaningful administrative actions a manager
takes: creating a person, editing their details, deactivating them. It answers
"who changed this, and when" — the question that always comes up after the fact
and that nothing else in the system can answer.

Design choices, each deliberate:

- **Append-only.** An entry is written once and never edited or deleted; that is
  the whole value of a log. It does not inherit :class:`BaseModel` because it is
  not a device-owned, syncable record — it is born on the server, keyed by a
  server-generated id, and stamped by the server clock alone.
- **Actor and target are kept by both id and a name snapshot.** The id is the
  live link; the snapshot (``actor_name``, ``target_label``) is what the entry
  *meant at the time*, so the log still reads correctly after someone is renamed
  or a row it points at changes.
- **Free-form ``metadata``.** What actually changed in an edit, as a small JSON
  blob — enough to show "role: cashier → kitchen" without a column per field.
"""
from __future__ import annotations

from django.db import models

from apps.core.models import Branch


class AuditLog(models.Model):
    class Action(models.TextChoices):
        """What was done. Grouped by the thing acted on, so a filter by prefix
        ("staff.", "item.") is meaningful without a second column."""

        STAFF_CREATED = "staff.created", "Staff created"
        STAFF_UPDATED = "staff.updated", "Staff updated"
        STAFF_DEACTIVATED = "staff.deactivated", "Staff deactivated"
        STAFF_REACTIVATED = "staff.reactivated", "Staff reactivated"

        ITEM_CREATED = "item.created", "Menu item created"
        ITEM_UPDATED = "item.updated", "Menu item updated"
        ITEM_RETIRED = "item.retired", "Menu item retired"
        ITEM_IMAGE = "item.image", "Menu item photo changed"

        CATEGORY_CREATED = "category.created", "Category created"
        CATEGORY_UPDATED = "category.updated", "Category updated"
        CATEGORY_DEACTIVATED = "category.deactivated", "Category deactivated"

        PRICE_BULK = "price.bulk", "Bulk price change"

        DELIVERY_STATUS = "delivery.status", "Delivery status changed"

        CUSTOMER_CREATED = "customer.created", "Customer created"
        CUSTOMER_UPDATED = "customer.updated", "Customer updated"
        CUSTOMER_RETIRED = "customer.retired", "Customer retired"
        CUSTOMER_SETTLED = "customer.settled", "Customer settled a debt"

        PROFILE_BRANDING = "profile.branding", "Landing page branding changed"

    # A monotonic integer pk, unlike the UUIDs used for device-owned records.
    # The log is server-born and append-only, and an auto-increment id gives it
    # a stable insertion order — the tiebreaker when two entries share a
    # timestamp, which a random UUID could never provide.
    id = models.BigAutoField(primary_key=True)
    branch = models.ForeignKey(
        Branch, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    action = models.CharField(max_length=32, choices=Action.choices, db_index=True)

    # Who did it. The id links to the live account; the name is what to show even
    # if that account is later renamed or gone.
    actor_id = models.UUIDField(null=True, blank=True)
    actor_name = models.CharField(max_length=120, blank=True)

    # What it was done to. A staff row here, but kept generic on purpose.
    target_id = models.UUIDField(null=True, blank=True)
    target_label = models.CharField(max_length=120, blank=True)

    # What changed, in whatever shape the action needs — e.g.
    # {"role": ["cashier", "kitchen"], "display_name": ["عمر", "عثمان"]}.
    metadata = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        # Insertion order, newest first — deterministic even when timestamps tie.
        ordering = ("-id",)
        indexes = [models.Index(fields=["branch", "-id"])]

    def __str__(self) -> str:
        return f"{self.action} by {self.actor_name or self.actor_id} at {self.created_at:%Y-%m-%d %H:%M}"

    def save(self, *args, **kwargs):
        # Append-only: an entry may be created, never rewritten.
        if not self._state.adding:
            raise ValueError("Audit log entries are immutable once written.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Audit log entries are never deleted.")
