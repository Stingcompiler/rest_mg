"""Manager authentication and device enrolment.

Every ViewSet in this project is a plain `viewsets.ViewSet` with hand-written
actions. No mixins, no ModelViewSet: what the endpoint does is visible in the
method body, not inherited from three classes away.
"""
from __future__ import annotations

from django.conf import settings
from django.contrib.auth import authenticate
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.models import Device, ManagerUser
from apps.accounts.permissions import IsManager, IsStaff
from apps.core.models import Branch


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
    """POST login/refresh/logout, GET me — for every staff role.

    One sign-in serves the manager dashboard, the cashier tablet and the kitchen
    screen; `role` on the response is what sends each person to their own app.
    """

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = []

    @action(detail=False, methods=["post"])
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

        refresh = RefreshToken.for_user(user)
        response = Response(ManagerUserSerializer(user).data)
        return _set_auth_cookies(response, refresh)

    @action(detail=False, methods=["post"])
    def refresh(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH) or request.data.get("refresh")
        if not raw:
            return Response(
                {"error": {"code": "unauthenticated", "message": "No refresh token."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            refresh = RefreshToken(raw)
            # Rotation: the presented token is replaced, not reused.
            user = ManagerUser.objects.get(id=refresh["user_id"])
            new_refresh = RefreshToken.for_user(user)
        except (TokenError, KeyError, ManagerUser.DoesNotExist):
            return Response(
                {"error": {"code": "unauthenticated", "message": "Invalid refresh token."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        response = Response(ManagerUserSerializer(user).data)
        return _set_auth_cookies(response, new_refresh)

    @action(detail=False, methods=["post"])
    def logout(self, request):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.AUTH_COOKIE_ACCESS, path=settings.AUTH_COOKIE_PATH)
        response.delete_cookie(settings.AUTH_COOKIE_REFRESH, path=settings.AUTH_COOKIE_PATH)
        return response

    @action(detail=False, methods=["get"], permission_classes=[IsStaff])
    def me(self, request):
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

        try:
            branch = Branch.objects.get(id=payload.validated_data["branch_id"])
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
            device = Device.objects.get(id=pk)
        except Device.DoesNotExist:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown device."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        device.revoke()
        return Response(DeviceSerializer(device).data)
