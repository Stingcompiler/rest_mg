"""Two kinds of identity, deliberately kept apart.

**Manager users** authenticate over the network with a password and carry a JWT
in httpOnly cookies. They exist only for `/manager`.

**Devices** are the cashier tablets. A tablet never authenticates a *person* to
the server — the cashier's PIN is checked locally against a hash in IndexedDB and
never leaves the device. What the tablet does need is credentials of its own, so
the server can tell one restaurant's tablet from another's when a sync batch
arrives. That is this token: enrolled once from the manager dashboard, bound to a
branch, revocable when a tablet is lost.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.utils import timezone

from apps.core.models import Branch, HardDeleteBlocked, NoDeleteManager, NoDeleteQuerySet


class ManagerUserManager(UserManager.from_queryset(NoDeleteQuerySet)):
    """Django's user manager, minus the ability to delete a row."""


class ManagerUser(AbstractUser):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        MANAGER = "manager", "Manager"
        # Staff who sign in on a device rather than the dashboard. The class is
        # still called ManagerUser for migration history; it is the staff account
        # for every role now, and `role` decides which app a sign-in lands in.
        CASHIER = "cashier", "Cashier"
        KITCHEN = "kitchen", "Kitchen"

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.MANAGER)
    # The name shown on screen and printed on tickets — "سمية", not "sumaya".
    # Orders and shifts snapshot it, so a later rename never rewrites history.
    display_name = models.CharField(max_length=80, blank=True)
    branch = models.ForeignKey(
        Branch, null=True, blank=True, on_delete=models.PROTECT, related_name="managers"
    )
    # Written into every token this person is issued (apps.accounts.tokens).
    # Raising it ends every session at once: a new password, deactivation, or
    # "sign out everywhere". Reactivating an account does not lower it, so the
    # sessions it ended stay ended.
    session_version = models.PositiveIntegerField(default=0)

    objects = ManagerUserManager()

    def delete(self, *args, **kwargs):
        raise HardDeleteBlocked("Users are never deleted. Set is_active=False.")

    def set_password(self, raw_password):
        super().set_password(raw_password)
        self.session_version += 1
        self._session_version_changed = True

    def save(self, *args, **kwargs):
        if not self._state.adding and not self.is_active:
            if type(self).objects.filter(pk=self.pk, is_active=True).exists():
                self.session_version += 1
                self._session_version_changed = True
        # Django's own partial saves name the fields they write — a sign-in that
        # upgrades the password hash saves only "password". The version raised
        # alongside it must reach the database too, or the token issued for that
        # very sign-in would not match.
        update_fields = kwargs.get("update_fields")
        if (
            update_fields is not None
            and getattr(self, "_session_version_changed", False)
            and "session_version" not in update_fields
        ):
            kwargs["update_fields"] = [*update_fields, "session_version"]
        super().save(*args, **kwargs)
        self._session_version_changed = False

    def end_all_sessions(self) -> None:
        """Invalidate every token issued to this person so far."""
        type(self).objects.filter(pk=self.pk).update(
            session_version=models.F("session_version") + 1
        )
        self.refresh_from_db(fields=["session_version"])


def hash_device_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class Device(models.Model):
    """A provisioned cashier tablet."""

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    label = models.CharField(max_length=80)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="devices")
    token_hash = models.CharField(max_length=64, unique=True, editable=False)
    enrolled_at = models.DateTimeField(auto_now_add=True)
    enrolled_by = models.ForeignKey(
        ManagerUser, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    objects = NoDeleteManager()

    def __str__(self) -> str:
        return f"{self.label} ({self.branch.name_ar})"

    def delete(self, *args, **kwargs):
        raise HardDeleteBlocked("Devices are never deleted. Call revoke().")

    # DRF sets request.user to whatever the authenticator returns; a device is a
    # first-class principal, so it answers the same question a user does.
    @property
    def is_authenticated(self) -> bool:
        return self.revoked_at is None

    @property
    def is_anonymous(self) -> bool:
        return False

    @classmethod
    def enrol(cls, *, label: str, branch: Branch, by=None) -> tuple["Device", str]:
        """Create a device and return it with its raw token — shown exactly once."""
        raw_token = secrets.token_urlsafe(32)
        device = cls.objects.create(
            label=label,
            branch=branch,
            token_hash=hash_device_token(raw_token),
            enrolled_by=by,
        )
        return device, raw_token

    def revoke(self) -> None:
        self.revoked_at = timezone.now()
        self.save(update_fields=["revoked_at"])

    def touch(self) -> None:
        self.last_seen_at = timezone.now()
        self.save(update_fields=["last_seen_at"])
