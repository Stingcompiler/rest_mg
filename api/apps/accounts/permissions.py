from __future__ import annotations

from rest_framework import permissions

from apps.accounts.models import Device, ManagerUser


class IsDevice(permissions.BasePermission):
    """An enrolled, unrevoked cashier tablet."""

    message = "This endpoint requires an enrolled device token."

    def has_permission(self, request, view) -> bool:
        device = request.user
        return isinstance(device, Device) and device.revoked_at is None


class IsManager(permissions.BasePermission):
    """A signed-in manager or owner."""

    message = "This endpoint requires a manager account."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return (
            isinstance(user, ManagerUser)
            and user.is_active
            and user.role in {ManagerUser.Role.MANAGER, ManagerUser.Role.OWNER}
        )


class IsSyncPrincipal(permissions.BasePermission):
    """Who may sync: an enrolled tablet, or a signed-in cashier/manager.

    The device token came first, when the cashier had no server login at all.
    Now that staff sign in, a signed-in cashier is just as good a principal —
    and it means a tablet works the moment someone logs in, with no token to
    provision by hand. Both are accepted; the token remains for an unattended
    device that syncs without anyone signed in.
    """

    message = "Sync requires an enrolled device or a signed-in cashier."

    def has_permission(self, request, view) -> bool:
        principal = request.user
        if isinstance(principal, Device):
            return principal.revoked_at is None
        return (
            isinstance(principal, ManagerUser)
            and principal.is_active
            and principal.role
            in {
                ManagerUser.Role.CASHIER,
                ManagerUser.Role.MANAGER,
                ManagerUser.Role.OWNER,
            }
        )


class IsCatalogEditor(permissions.BasePermission):
    """Who may manage the menu: owner, manager, or cashier.

    The cashier is included deliberately — at a single-branch restaurant the
    person at the till is often the one who adds today's dish or marks something
    sold out. The kitchen is not: it prepares food, it does not price it. This is
    additive to the catalogue's former manager-only rule, widening it by one
    role rather than replacing the authorization model.
    """

    message = "This endpoint requires a manager or cashier account."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return (
            isinstance(user, ManagerUser)
            and user.is_active
            and user.role
            in {
                ManagerUser.Role.OWNER,
                ManagerUser.Role.MANAGER,
                ManagerUser.Role.CASHIER,
            }
        )


class IsOrderProcessor(permissions.BasePermission):
    """Who may advance a delivery order's fulfilment: owner, manager, cashier.

    The same front-of-house set as the catalogue editor, but named for its own
    job so the two can diverge later. It gates only the delivery-status action —
    an order's financial record stays read-only for everyone, exactly as before.
    """

    message = "This endpoint requires a manager or cashier account."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return (
            isinstance(user, ManagerUser)
            and user.is_active
            and user.role
            in {
                ManagerUser.Role.OWNER,
                ManagerUser.Role.MANAGER,
                ManagerUser.Role.CASHIER,
            }
        )


class IsStaff(permissions.BasePermission):
    """Any signed-in staff member, whatever their role.

    Used by `auth/me`, which every surface calls to find out who is signed in —
    including the cashier and the kitchen, who are not managers.
    """

    message = "Sign in to continue."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return isinstance(user, ManagerUser) and user.is_active


class IsKitchen(permissions.BasePermission):
    """Kitchen staff, plus managers and owners who may look at the pass."""

    message = "This endpoint requires a kitchen account."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return (
            isinstance(user, ManagerUser)
            and user.is_active
            and user.role
            in {ManagerUser.Role.KITCHEN, ManagerUser.Role.MANAGER, ManagerUser.Role.OWNER}
        )


class IsOwner(permissions.BasePermission):
    message = "This endpoint requires an owner account."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return (
            isinstance(user, ManagerUser)
            and user.is_active
            and user.role == ManagerUser.Role.OWNER
        )
