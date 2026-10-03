"""Shared model foundations.

Three rules are enforced here rather than trusted to every model author:

1. **Client-generated UUID primary keys.** The cashier tablet creates records
   offline and must be able to name them before the server has ever seen them.
   A record without an id is a programming error, not a database default.
2. **No hard deletes, anywhere.** `delete()` raises on both the instance and the
   queryset. Records are retired with a status flag.
3. **Two clocks.** `created_at` / `updated_at` come from the device and may drift
   or jump. `server_created_at` / `server_updated_at` are set here and are the
   only safe basis for the sync pull cursor.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class HardDeleteBlocked(Exception):
    """Raised on any attempt to physically remove a row."""


class NoDeleteQuerySet(models.QuerySet):
    def delete(self):
        raise HardDeleteBlocked(
            f"{self.model.__name__} rows are never deleted. Retire them with a status flag."
        )

    def hard_delete(self):
        """The deliberate escape hatch, for the two cases that are not business
        deletions: fixture teardown, and replacing the child rows (lines,
        payments) of a *live* record the device has re-pushed with newer truth.
        Never call this on a record that is history — closed orders and shifts
        are immutable, and `delete()` raising is what protects them.
        """
        return super().delete()


NoDeleteManager = models.Manager.from_queryset(NoDeleteQuerySet)


class Branch(models.Model):
    """A restaurant location. Every other record is scoped to one."""

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    name_ar = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = NoDeleteManager()

    class Meta:
        verbose_name_plural = "branches"

    def __str__(self) -> str:
        return self.name_ar

    def delete(self, *args, **kwargs):
        raise HardDeleteBlocked("Branches are never deleted. Set is_active=False.")

    def save(self, *args, **kwargs):
        # Isolation between branches is unfinished (review finding F02), so a
        # second branch is refused while SINGLE_BRANCH is on. Inactive branches
        # count: their records are just as reachable.
        if self._state.adding and settings.SINGLE_BRANCH and Branch.objects.exists():
            raise ValidationError(
                "This installation runs a single branch. Records are not yet "
                "isolated between branches, so a second one cannot be added."
            )
        super().save(*args, **kwargs)


class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)
    branch = models.ForeignKey(
        Branch,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    # Device clock — preserved exactly as the tablet recorded it.
    created_at = models.DateTimeField(db_index=True)
    updated_at = models.DateTimeField()
    # Server clock — monotonic here, and the authority for the pull cursor.
    server_created_at = models.DateTimeField(auto_now_add=True)
    server_updated_at = models.DateTimeField(auto_now=True, db_index=True)
    synced_at = models.DateTimeField(null=True, blank=True)

    objects = NoDeleteManager()

    class Meta:
        abstract = True
        get_latest_by = "server_updated_at"

    def save(self, *args, **kwargs):
        if self.id is None:
            raise ValueError(
                f"{type(self).__name__}.id must be a client-generated UUID. "
                "The server never invents identity for a record the device owns."
            )
        now = timezone.now()
        if self.created_at is None:
            self.created_at = now
        if self.updated_at is None:
            self.updated_at = now
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise HardDeleteBlocked(
            f"{type(self).__name__} rows are never deleted. Retire them with a status flag."
        )

    def mark_synced(self, when=None) -> None:
        self.synced_at = when or timezone.now()
        self.save(update_fields=["synced_at", "server_updated_at"])
