"""Reading the activity log — manager-only, newest first, filterable.

Read-only by construction: there is no create/update/destroy here. Entries are
written by :mod:`apps.audit.services` from the actions themselves, never by a
client posting to this endpoint.

The filters exist so the log answers a real question rather than being a wall of
text: *what did this person do*, and *what happened on this day*. Both narrow the
same query, so they compose.
"""
from __future__ import annotations

from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.permissions import IsManager
from apps.audit.models import AuditLog
from apps.core.query import page, parse_page, parse_window

# Keep the payload bounded; the log grows without limit and no screen shows it
# all at once.
DEFAULT_LIMIT = 50
MAX_LIMIT = 500


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "actor_id",
            "actor_name",
            "target_id",
            "target_label",
            "metadata",
            "created_at",
        ]


class AuditLogViewSet(viewsets.ViewSet):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsManager]

    def _scoped(self, request):
        entries = AuditLog.objects.all()
        if request.user.branch_id:
            entries = entries.filter(branch_id=request.user.branch_id)
        return entries

    def list(self, request):
        entries = self._scoped(request)

        # Who did it.
        actor = request.query_params.get("actor")
        if actor:
            entries = entries.filter(actor_id=actor)

        # What kind of thing they did. A bare prefix ("staff") matches the whole
        # family, so the caller does not have to enumerate every variant.
        action_filter = request.query_params.get("action")
        if action_filter:
            if "." in action_filter:
                entries = entries.filter(action=action_filter)
            else:
                entries = entries.filter(action__startswith=f"{action_filter}.")

        # When. Shared with the reports so a bad date is a 400, not a 500.
        window_from, window_to = parse_window(request.query_params)
        if window_from:
            entries = entries.filter(created_at__gte=window_from)
        if window_to:
            entries = entries.filter(created_at__lte=window_to)

        limit, offset = parse_page(
            request.query_params, default=DEFAULT_LIMIT, maximum=MAX_LIMIT
        )
        total = entries.count()
        rows = AuditLogSerializer(entries[offset : offset + limit], many=True).data
        return Response(page(rows, total, limit, offset))

    @action(detail=False, methods=["get"])
    def actors(self, request):
        """Everyone who has ever appeared in this branch's log.

        Drawn from the log itself rather than from the staff list, so somebody
        who has since been deactivated still appears — otherwise their history
        would become unfilterable the day they left.
        """
        rows = (
            self._scoped(request)
            .exclude(actor_id=None)
            .values("actor_id", "actor_name")
            .distinct()
        )
        seen: dict[str, str] = {}
        for row in rows:
            seen.setdefault(str(row["actor_id"]), row["actor_name"] or "")
        return Response(
            sorted(
                ({"id": key, "name": value} for key, value in seen.items()),
                key=lambda entry: entry["name"],
            )
        )
