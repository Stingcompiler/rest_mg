"""Staff administration — the manager creating the people who use the system.

Only a manager or owner reaches this. Accounts are never deleted (the rule holds
here as everywhere): a person who leaves is deactivated, which keeps every order
and shift they ever worked attributable to a real account.
"""
from __future__ import annotations

import uuid

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.models import ManagerUser
from apps.accounts.permissions import IsManager
from apps.audit import services as audit
from apps.audit.models import AuditLog

# An owner is the account that administers the others, so it is not handed out
# here; a manager may create staff, not peers above them.
ASSIGNABLE_ROLES = [
    ManagerUser.Role.MANAGER,
    ManagerUser.Role.CASHIER,
    ManagerUser.Role.KITCHEN,
]


class StaffSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    username = serializers.CharField(max_length=150)
    display_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=[(r.value, r.label) for r in ASSIGNABLE_ROLES])
    is_active = serializers.BooleanField(required=False, default=True)
    # Write-only: a password is set, never read back.
    password = serializers.CharField(write_only=True, required=False, min_length=8)


class StaffViewSet(viewsets.ViewSet):
    """Explicit ViewSet, hand-written actions — as everywhere in this project."""

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsManager]

    def _scope(self, request):
        people = ManagerUser.objects.order_by("role", "username")
        if request.user.branch_id:
            people = people.filter(branch_id=request.user.branch_id)
        return people

    def list(self, request):
        return Response(StaffSerializer(self._scope(request), many=True).data)

    def create(self, request):
        payload = StaffSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        if not data.get("password"):
            raise serializers.ValidationError({"password": "A new account needs a password."})
        if ManagerUser.objects.filter(username=data["username"]).exists():
            raise serializers.ValidationError({"username": "That username is taken."})

        person = ManagerUser.objects.create_user(
            id=uuid.uuid4(),
            username=data["username"],
            password=data["password"],
            role=data["role"],
            display_name=data.get("display_name", ""),
            branch=request.user.branch,
        )
        audit.record(
            action=AuditLog.Action.STAFF_CREATED,
            actor=request.user,
            target=person,
            metadata={"role": person.role, "username": person.username},
        )
        return Response(StaffSerializer(person).data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        """Edit a person's details.

        A partial edit: send only the fields that change. Every change is diffed
        against what was there and written to the activity log, so the record of
        *what* changed is a by-product of the edit rather than an afterthought.
        The password is the one field never diffed — the log records that it was
        reset, never its value, old or new.
        """
        person = self._scope(request).filter(id=pk).first()
        if person is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown account."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        # partial=True: this is a PATCH-style edit; unsent fields are left alone.
        payload = StaffSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        # A username collision must be caught here, not left to the database.
        new_username = data.get("username")
        if new_username and new_username != person.username:
            if ManagerUser.objects.filter(username=new_username).exclude(id=person.id).exists():
                raise serializers.ValidationError({"username": "That username is taken."})

        # Reactivating yourself is fine; deactivating yourself is not — a manager
        # locking themselves out is a foot-gun, and the log would lose its actor.
        if "is_active" in data and not data["is_active"] and person.id == request.user.id:
            return Response(
                {
                    "error": {
                        "code": "validation_error",
                        "message": "You cannot deactivate your own account.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        changes: dict[str, list] = {}
        was_active = person.is_active
        for field in ("username", "display_name", "role", "is_active"):
            if field in data and data[field] != getattr(person, field):
                changes[field] = [getattr(person, field), data[field]]
                setattr(person, field, data[field])
        if data.get("password"):
            person.set_password(data["password"])
            changes["password"] = ["reset", None]

        person.save()

        # An activation toggle reads better as its own verb than as a field diff.
        if "is_active" in changes:
            action = (
                AuditLog.Action.STAFF_REACTIVATED
                if person.is_active
                else AuditLog.Action.STAFF_DEACTIVATED
            )
        else:
            action = AuditLog.Action.STAFF_UPDATED
        if changes:
            audit.record(action=action, actor=request.user, target=person, metadata=changes)

        return Response(StaffSerializer(person).data)

    def destroy(self, request, pk=None):
        """No hard deletes. A person who leaves is deactivated."""
        person = self._scope(request).filter(id=pk).first()
        if person is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown account."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        if person.id == request.user.id:
            return Response(
                {
                    "error": {
                        "code": "validation_error",
                        "message": "You cannot deactivate your own account.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if person.is_active:
            person.is_active = False
            person.save(update_fields=["is_active"])
            audit.record(
                action=AuditLog.Action.STAFF_DEACTIVATED,
                actor=request.user,
                target=person,
            )
        return Response(StaffSerializer(person).data)

    @action(detail=False, methods=["get"])
    def roles(self, request):
        """The roles a manager may assign, for the picker."""
        return Response([{"value": r.value, "label": r.label} for r in ASSIGNABLE_ROLES])
