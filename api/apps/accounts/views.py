"""Manager authentication and device enrolment.

Every ViewSet in this project is a plain `viewsets.ViewSet` with hand-written
actions. No mixins, no ModelViewSet: what the endpoint does is visible in the
method body, not inherited from three classes away.
"""
from __future__ import annotations

from django.conf import settings
from django.contrib.auth import authenticate
from django.middleware.csrf import get_token
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.models import Device, ManagerUser
from apps.accounts.permissions import IsManager, IsStaff
from apps.accounts.throttles import LOGIN_THROTTLES
from apps.accounts.tokens import issue_tokens, session_is_current
from apps.core.models import Branch
from apps.core.scoping import visible


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


class ManagerUserSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    username = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    # The client routes on `role` after sign-in, and shows `display_name` as the
    # staff member's name on screen and on printed tickets.
    display_name = serializers.CharField(read_only=True)
    branch_id = serializers.UUIDField(read_only=True, allow_null=True)


class DeviceSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    label = serializers.CharField(max_length=80)
    branch_id = serializers.UUIDField()
    enrolled_at = serializers.DateTimeField(read_only=True)
    revoked_at = serializers.DateTimeField(read_only=True, allow_null=True)
    last_seen_at = serializers.DateTimeField(read_only=True, allow_null=True)


def _clear_auth_cookies(response: Response) -> Response:
    response.delete_cookie(settings.AUTH_COOKIE_ACCESS, path=settings.AUTH_COOKIE_PATH)
    response.delete_cookie(settings.AUTH_COOKIE_REFRESH, path=settings.AUTH_COOKIE_PATH)
    return response


def _set_auth_cookies(response: Response, refresh: RefreshToken) -> Response:
    common = {
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "path": settings.AUTH_COOKIE_PATH,
    }
    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS,
        str(refresh.access_token),
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        **common,
    )
    response.set_cookie(
        settings.AUTH_COOKIE_REFRESH,
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        **common,
    )
    return response


class AuthViewSet(viewsets.ViewSet):
    """POST login/refresh/logout/logout-all, GET me — for every staff role.

    One sign-in serves the manager dashboard, the cashier tablet and the kitchen
    screen; `role` on the response is what sends each person to their own app.

    Signing in, refreshing and signing out read no access cookie: they must work
    when the one in the browser has expired or its session has ended, and they
    act only on the credentials they are given. Each response that leaves a
    session in place also sets the CSRF cookie the client sends back on writes.
    """

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = []

    @action(detail=False, methods=["post"], authentication_classes=[], throttle_classes=LOGIN_THROTTLES)
    def login(self, request):
        payload = LoginSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        user = authenticate(
            request,
            username=payload.validated_data["username"],
            password=payload.validated_data["password"],
        )
        if user is None or not user.is_active:
            return Response(
                {"error": {"code": "invalid_credentials", "message": "Incorrect username or password."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        response = Response(ManagerUserSerializer(user).data)
        get_token(request)
        return _set_auth_cookies(response, issue_tokens(user))

    @action(detail=False, methods=["post"], authentication_classes=[])
    def refresh(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH) or request.data.get("refresh")
        refused = Response(
            {"error": {"code": "unauthenticated", "message": "Invalid refresh token."}},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        if not raw:
            return refused
        try:
            # Verifies the signature and expiry, and refuses a blacklisted token.
            presented = RefreshToken(raw)
            user = ManagerUser.objects.get(id=presented["user_id"])
        except (TokenError, KeyError, ManagerUser.DoesNotExist):
            return refused
        if not user.is_active or not session_is_current(presented, user):
            return refused

        # Rotation: the presented token is spent, then replaced.
        presented.blacklist()
        response = Response(ManagerUserSerializer(user).data)
        get_token(request)
        return _set_auth_cookies(response, issue_tokens(user))

    @action(detail=False, methods=["post"], authentication_classes=[])
    def logout(self, request):
        """End this device's session: its refresh token stops working at once.

        The access token it already holds lapses on its own within its short
        lifetime; to end every session immediately there is logout-all.
        """
        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH) or request.data.get("refresh")
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass  # Already expired or revoked: nothing left to end.
        return _clear_auth_cookies(Response(status=status.HTTP_204_NO_CONTENT))

    @action(detail=False, methods=["post"], url_path="logout-all", permission_classes=[IsStaff])
    def logout_all(self, request):
        """End every session of the signed-in person, on every device.

        The way out for someone who thinks a device or a password was taken —
        including a sole owner, who cannot deactivate their own account.
        """
        request.user.end_all_sessions()
        return _clear_auth_cookies(Response(status=status.HTTP_204_NO_CONTENT))

    @action(detail=False, methods=["get"], permission_classes=[IsStaff])
    def me(self, request):
        get_token(request)
        return Response(ManagerUserSerializer(request.user).data)


class DeviceViewSet(viewsets.ViewSet):
    """Tablet provisioning. The raw token is returned once, at enrolment."""

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsManager]

    def list(self, request):
        devices = Device.objects.select_related("branch").order_by("-enrolled_at")
        if request.user.branch_id:
            devices = devices.filter(branch_id=request.user.branch_id)
        return Response(DeviceSerializer(devices, many=True).data)

    def create(self, request):
        payload = DeviceSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        # A branch manager enrols tablets for their own branch only; the owner,
        # over every branch, for any.
        branch_id = payload.validated_data["branch_id"]
        own = getattr(request.user, "branch_id", None)
        try:
            if own is not None and branch_id != own:
                raise Branch.DoesNotExist
            branch = Branch.objects.get(id=branch_id)
        except Branch.DoesNotExist:
            raise serializers.ValidationError({"branch_id": "Unknown branch."})

        device, raw_token = Device.enrol(
            label=payload.validated_data["label"], branch=branch, by=request.user
        )
        body = DeviceSerializer(device).data
        # Shown exactly once. It is not recoverable — re-enrol instead.
        body["token"] = raw_token
        return Response(body, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        try:
            device = visible(Device.objects, request.user).get(id=pk)
        except Device.DoesNotExist:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown device."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        device.revoke()
        return Response(DeviceSerializer(device).data)
