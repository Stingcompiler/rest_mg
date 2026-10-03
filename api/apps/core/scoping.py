"""Which records a caller may reach — one rule for every endpoint (review F02).

A staff member or device tied to a branch reaches only that branch's records.
Someone with no branch — the owner over the whole restaurant — reaches all of
them. Before this, lists were mostly scoped but fetching or changing a single
record went by its id alone, so a known id was enough to read or edit another
branch's data.

Some records may have no branch at all: a menu or a profile shared by every
branch. Those are *visible* to everyone (``shared=True`` when reading), but
only someone with no branch may change them — a branch manager editing a
shared dish would be editing every other branch's menu too.
"""
from __future__ import annotations

from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response


def branch_of(principal):
    """The caller's branch id, or None for a caller over every branch."""
    return getattr(principal, "branch_id", None)


def visible(queryset, principal, *, shared: bool = False, field: str = "branch_id"):
    """Rows the caller may read. ``shared`` also admits rows with no branch."""
    branch_id = branch_of(principal)
    if branch_id is None:
        return queryset
    if shared:
        # Not `__in=[branch_id, None]`: Django drops None from an IN list, so
        # that form never matched a shared row at all.
        return queryset.filter(Q(**{field: branch_id}) | Q(**{f"{field}__isnull": True}))
    return queryset.filter(**{field: branch_id})


def can_change(record, principal) -> bool:
    """May the caller change this (already visible) record?"""
    branch_id = branch_of(principal)
    return branch_id is None or record.branch_id == branch_id


def not_found(message: str = "Not found.") -> Response:
    return Response(
        {"error": {"code": "not_found", "message": message}},
        status=status.HTTP_404_NOT_FOUND,
    )


def shared_record() -> Response:
    return Response(
        {
            "error": {
                "code": "shared_record",
                "message": "This is shared by every branch; only the owner can change it.",
            }
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def in_branch_or_shared(branch_id, field: str = "branch_id") -> Q:
    """Rows of one branch plus shared rows, for a branch known without a caller."""
    return Q(**{field: branch_id}) | Q(**{f"{field}__isnull": True})
