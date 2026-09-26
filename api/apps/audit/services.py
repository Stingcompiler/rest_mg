"""Writing to the activity log.

One function, so every call site records an entry the same way and callers never
touch the model directly. Recording a log entry must never be the thing that
breaks the action being logged — an audit failure is swallowed and reported, not
raised, because a manager renaming a cashier should not get a 500 because the log
table hiccuped.
"""
from __future__ import annotations

import logging
from typing import Any

from apps.audit.models import AuditLog

logger = logging.getLogger(__name__)


def record(
    *,
    action: str,
    actor,
    target=None,
    target_label: str = "",
    metadata: dict[str, Any] | None = None,
) -> AuditLog | None:
    """Append one entry. ``actor`` is the acting ManagerUser; ``target`` the
    account acted on (optional). Returns the entry, or None if writing it failed.
    """
    try:
        return AuditLog.objects.create(
            branch=getattr(actor, "branch", None),
            action=action,
            actor_id=getattr(actor, "id", None),
            actor_name=getattr(actor, "display_name", "") or getattr(actor, "username", ""),
            target_id=getattr(target, "id", None),
            target_label=target_label
            or getattr(target, "display_name", "")
            or getattr(target, "username", ""),
            metadata=metadata or {},
        )
    except Exception:  # noqa: BLE001 — logging must not break the logged action
        logger.exception("failed to write audit entry action=%s", action)
        return None
