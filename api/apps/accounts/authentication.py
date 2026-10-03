"""Authentication classes. Nothing is authenticated by default (see base settings)."""
from __future__ import annotations

from django.conf import settings
from rest_framework import authentication, exceptions
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.models import Device, hash_device_token
from apps.accounts.tokens import session_is_current


class DeviceAuthentication(authentication.BaseAuthentication):
    """`Authorization: Device <token>` — cashier tablets, sync endpoints only."""

    keyword = "Device"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).split()
        if not header or header[0].decode().lower() != self.keyword.lower():
            return None
        if len(header) != 2:
            raise exceptions.AuthenticationFailed("Malformed device credentials.")

        raw_token = header[1].decode()
        try:
            device = Device.objects.select_related("branch").get(
                token_hash=hash_device_token(raw_token)
            )
        except Device.DoesNotExist:
            raise exceptions.AuthenticationFailed("Unknown device.")

        if device.revoked_at is not None:
            raise exceptions.AuthenticationFailed("This device has been revoked.")

        return device, None

    def authenticate_header(self, request) -> str:
        return self.keyword


class CsrfFailed(exceptions.PermissionDenied):
    """A cookie-authenticated write without a valid CSRF token."""

    error_code = "csrf_failed"


class CookieJWTAuthentication(JWTAuthentication):
    """Staff auth. Reads the access token from an httpOnly cookie.

    The Authorization header is still honoured so that server-to-server calls and
    tests do not need a cookie jar, but browsers never hold a token in JS.

    A cookie rides along with any request the browser makes, so a write that is
    authenticated by it must also pass Django's CSRF check — exactly what
    SessionAuthentication does. A Bearer header is something a page has to set
    deliberately, so it keeps its own contract and needs no CSRF token.
    """

    def authenticate(self, request):
        header_result = super().authenticate(request)
        if header_result is not None:
            return header_result

        raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
        if not raw_token:
            return None

        validated = self.get_validated_token(raw_token)
        user = self.get_user(validated)
        self.enforce_csrf(request)
        return user, validated

    def get_user(self, validated_token):
        # The default already refuses an inactive account. A token from before
        # the person's sessions were ended (new password, deactivation, "sign out
        # everywhere") is refused here, even though it has not expired.
        user = super().get_user(validated_token)
        if not session_is_current(validated_token, user):
            raise exceptions.AuthenticationFailed("This session has ended.", code="session_ended")
        return user

    @staticmethod
    def enforce_csrf(request):
        def dummy_get_response(_request):  # pragma: no cover - never called
            return None

        check = CSRFCheck(dummy_get_response)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise CsrfFailed(f"CSRF Failed: {reason}")
