"""Serializer fields shared across apps."""
from __future__ import annotations

from rest_framework import serializers


class MoneyField(serializers.Field):
    """Money in minor units, carried over the wire as a decimal string.

    JSON numbers are IEEE 754 doubles; under severe inflation an amount in minor
    units can exceed 2**53 and lose precision silently. Strings do not. Django
    stores the value in a BigIntegerField and Python keeps it an int, which is
    arbitrary precision.
    """

    default_error_messages = {
        "invalid": "Money must be an integer string in minor units.",
        "negative": "Money may not be negative.",
    }

    def __init__(self, *args, allow_negative: bool = False, **kwargs):
        self.allow_negative = allow_negative
        super().__init__(*args, **kwargs)

    def to_representation(self, value) -> str:
        return str(int(value))

    def to_internal_value(self, data) -> int:
        if isinstance(data, bool) or isinstance(data, float):
            self.fail("invalid")
        try:
            value = int(str(data).strip())
        except (TypeError, ValueError):
            self.fail("invalid")
        if value < 0 and not self.allow_negative:
            self.fail("negative")
        return value
