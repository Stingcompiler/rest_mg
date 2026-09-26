"""Authentication classes. Nothing is authenticated by default (see base settings)."""
from __future__ import annotations

from django.conf import settings
from rest_framework import authentication, exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.models import Device, hash_device_token


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


class CookieJWTAuthentication(JWTAuthentication):
    """Manager auth. Reads the access token from an httpOnly cookie.

    The Authorization header is still honoured so that server-to-server calls and
    tests do not need a cookie jar, but browsers never hold a token in JS.
    """

    def authenticate(self, request):
        header_result = super().authenticate(request)
        if header_result is not None:
            return header_result

        raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
        if not raw_token:
            return None

        validated = self.get_validated_token(raw_token)
        return self.get_user(validated), validated
