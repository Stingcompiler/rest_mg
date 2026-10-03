"""The tokens a signed-in person is issued.

Every refresh token — and the access tokens derived from it — carries the
person's ``session_version``. Authentication rejects a token whose version no
longer matches (``CookieJWTAuthentication.get_user``), which is how a new
password, deactivation or "sign out everywhere" ends sessions that were issued
before it. Individual refresh tokens are revoked through Simple JWT's blacklist:
once used to refresh, and when the device signs out.
"""
from __future__ import annotations

from rest_framework_simplejwt.tokens import RefreshToken

SESSION_CLAIM = "sv"


def issue_tokens(user) -> RefreshToken:
    refresh = RefreshToken.for_user(user)
    refresh[SESSION_CLAIM] = user.session_version
    return refresh


def session_is_current(token, user) -> bool:
    return token.get(SESSION_CLAIM, 0) == user.session_version
