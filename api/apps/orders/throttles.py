"""Limits on placing website orders.

The order endpoint needs no sign-in and every order lands in front of the floor
staff, so without a limit a script could flood the restaurant with fake orders.
Two limits: per phone number, which is what a real customer orders under, and a
looser one per address, because many phones on a mobile network can share one
address. Neither is complete protection; together with confirmation before the
kitchen (D1) they keep a flood from reaching the food.
"""
from __future__ import annotations

import hashlib
import re

from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle


class PublicOrderAddressThrottle(SimpleRateThrottle):
    scope = "public_order_address"

    def get_rate(self):
        return settings.PUBLIC_ORDER_THROTTLE_RATES["address"]

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class PublicOrderPhoneThrottle(SimpleRateThrottle):
    scope = "public_order_phone"

    def get_rate(self):
        return settings.PUBLIC_ORDER_THROTTLE_RATES["phone"]

    def get_cache_key(self, request, view):
        digits = re.sub(r"\D", "", str(request.data.get("customer_phone", "")))
        if not digits:
            return None
        ident = hashlib.sha256(digits.encode("utf-8")).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": ident}


PUBLIC_ORDER_THROTTLES = [PublicOrderAddressThrottle, PublicOrderPhoneThrottle]
