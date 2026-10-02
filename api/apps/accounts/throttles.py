"""Limits on sign-in attempts.

Two independent limits: per address, so one client cannot try many accounts
quickly, and per account, so many addresses cannot share the guessing of one
password. Every attempt counts, successful or not; the rates leave ordinary use
far below them. The counts live in the default cache, which must be shared by
every server process in production (see config/settings/prod.py).
"""
from __future__ import annotations

import hashlib

from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle


class LoginAddressThrottle(SimpleRateThrottle):
    scope = "login_address"

    def get_rate(self):
        return settings.LOGIN_THROTTLE_RATES["address"]

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class _LoginAccountThrottle(SimpleRateThrottle):
    rate_name = ""

    def get_rate(self):
        return settings.LOGIN_THROTTLE_RATES[self.rate_name]

    def get_cache_key(self, request, view):
        username = str(request.data.get("username", "")).strip().lower()
        if not username:
            return None
        # Hashed so the cache never holds the names people typed.
        ident = hashlib.sha256(username.encode("utf-8")).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": ident}


class LoginAccountMinuteThrottle(_LoginAccountThrottle):
    scope = "login_account_minute"
    rate_name = "account_minute"


class LoginAccountHourThrottle(_LoginAccountThrottle):
    scope = "login_account_hour"
    rate_name = "account_hour"


LOGIN_THROTTLES = [LoginAddressThrottle, LoginAccountMinuteThrottle, LoginAccountHourThrottle]
