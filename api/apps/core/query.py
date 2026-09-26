"""Parsing the date window a report or list is asked for.

A malformed `from`/`to` used to reach the ORM untouched and surface as a 500:
the caller sent a bad parameter and the server reported its own failure. A
query string is client input like any other, so it is validated here and
refused with a 400 instead.

The parser accepts what callers actually send — an ISO instant with a `Z`, an
offset, or a plain date — and treats a bare date as midnight in the current
timezone, which is what "from=2026-08-19" is meant to mean.
"""
from __future__ import annotations

from datetime import datetime, time

from django.utils import timezone
from rest_framework import serializers


def parse_window(params, *, from_key: str = "from", to_key: str = "to"):
    """Return (from, to) as aware datetimes or None. Raises ValidationError."""
    return _parse_one(params.get(from_key), from_key), _parse_one(params.get(to_key), to_key)


def _parse_one(raw: str | None, field: str):
    if not raw:
        return None
    text = raw.strip()
    if not text:
        return None

    # An unencoded "+" in a query string arrives as a space; restore it rather
    # than rejecting a caller for a URL-encoding subtlety.
    if " " in text and "T" in text:
        head, _, tail = text.partition(" ")
        if tail[:2].isdigit() and ":" in tail:
            text = f"{head}+{tail}"

    value = None
    try:
        value = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        parsed_date = None
        try:
            parsed_date = datetime.strptime(text, "%Y-%m-%d").date()
        except ValueError:
            parsed_date = None
        if parsed_date is not None:
            value = datetime.combine(parsed_date, time.min)

    if value is None:
        raise serializers.ValidationError(
            {field: "Expected a date (YYYY-MM-DD) or an ISO timestamp."}
        )
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value


# --- paging ------------------------------------------------------------------
#
# Four lists in this system have no natural ceiling: the audit log, orders,
# deliveries and customers. All four used to answer with a hard slice — the most
# recent N, and no way to ask for anything older. That is not a page, it is a
# truncation the caller cannot see, and it quietly hides history the manager is
# entitled to.
#
# So: offset paging, in one place, with the same envelope everywhere.
#
# Offset rather than a cursor, deliberately. A cursor needs one stable ordering
# key per endpoint, and these lists are ordered by whatever the screen asked for
# — a balance, a date, a number. The known cost is that a row inserted while the
# manager is between pages can shift the window and repeat or skip an entry.
# For a single restaurant's history, read by one person at a time, that is a
# fair trade for a list that stays honest about what it is showing.

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


def _int_or(raw, fallback: int) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return fallback


def parse_page(params, *, default: int = DEFAULT_PAGE_SIZE, maximum: int = MAX_PAGE_SIZE):
    """Return (limit, offset), clamped. A nonsense value falls back, never 500s."""
    limit = max(1, min(_int_or(params.get("limit"), default), maximum))
    offset = max(0, _int_or(params.get("offset"), 0))
    return limit, offset


def page(rows, total: int, limit: int, offset: int) -> dict:
    """The envelope every paginated list answers with.

    `total` is what makes this a page rather than a slice: without it the screen
    cannot say "50 of 8,431" or know whether to offer another page at all.
    `next_offset` is None on the last page, so the caller never has to do the
    arithmetic to find out it has reached the end.
    """
    return {
        "results": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
        "next_offset": offset + limit if offset + limit < total else None,
    }
