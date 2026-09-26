from __future__ import annotations

from rest_framework import serializers

from apps.core.fields import MoneyField
from apps.shifts.models import CashCount, Shift


class CashCountSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    denomination_minor = MoneyField(required=False, allow_null=True)
    label = serializers.CharField(max_length=32, required=False, allow_blank=True)
    count = serializers.IntegerField(min_value=0, default=0)
    line_total_minor = MoneyField()
    created_at = serializers.DateTimeField(required=False)
    updated_at = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        denomination = attrs.get("denomination_minor")
        # Coins are counted as a lump sum with no denomination, so only note rows
        # are checked against count × face value.
        if denomination is not None:
            expected = denomination * attrs["count"]
            if attrs["line_total_minor"] != expected:
                raise serializers.ValidationError(
                    {"line_total_minor": f"Must equal denomination × count ({expected})."}
                )
        return attrs


class ShiftReadSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    cashier_name = serializers.CharField(read_only=True)
    opened_at = serializers.DateTimeField(read_only=True)
    closed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    opening_float_minor = MoneyField(read_only=True)
    expected_cash_minor = MoneyField(read_only=True)
    counted_cash_minor = MoneyField(read_only=True)
    variance_minor = MoneyField(read_only=True, allow_negative=True)
    variance_reason = serializers.CharField(read_only=True)
    synced_at = serializers.DateTimeField(read_only=True, allow_null=True)
    counts = CashCountSerializer(many=True, read_only=True)

    @staticmethod
    def queryset():
        return Shift.objects.prefetch_related("counts", "orders__payments")
