"""The sync envelope and the write shapes it carries."""
from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from apps.catalog.serializers import AvailabilityChangeSerializer, PriceChangeSerializer
from apps.core.fields import MoneyField
from apps.orders.models import Order
from apps.orders.serializers import OrderLineSerializer, PaymentSerializer
from apps.shifts.models import Shift
from apps.shifts.serializers import CashCountSerializer


class OrderPushSerializer(serializers.Serializer):
    """A finished order as the tablet recorded it.

    Only terminal orders are accepted. An order still on the screen belongs to
    the device; the server hears about it once it is closed or voided, and never
    hears about it twice.
    """

    id = serializers.UUIDField()
    number = serializers.CharField(max_length=32)
    type = serializers.ChoiceField(choices=Order.Type.choices)
    status = serializers.ChoiceField(choices=Order.Status.choices)
    table_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    subtotal_minor = MoneyField()
    discount_minor = MoneyField(required=False, default=0)
    total_minor = MoneyField()
    opened_at = serializers.DateTimeField()
    sent_at = serializers.DateTimeField(required=False, allow_null=True)
    closed_at = serializers.DateTimeField(required=False, allow_null=True)
    cashier_id = serializers.UUIDField(required=False, allow_null=True)
    cashier_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    shift_ref = serializers.UUIDField(required=False, allow_null=True)
    void_reason = serializers.CharField(max_length=240, required=False, allow_blank=True)
    corrects_id = serializers.UUIDField(required=False, allow_null=True)
    created_at = serializers.DateTimeField(required=False)
    updated_at = serializers.DateTimeField(required=False)
    lines = OrderLineSerializer(many=True)
    payments = PaymentSerializer(many=True)

    def validate(self, attrs):
        status = attrs["status"]
        # `sent` joins the terminal states because the kitchen display needs to
        # see a ticket the moment it is fired, not when the bill is settled. An
        # order still on the screen (open/parked) remains the device's business.
        if status not in {Order.Status.SENT, Order.Status.CLOSED, Order.Status.VOID}:
            raise serializers.ValidationError(
                {"status": "Only sent, closed or void orders are pushed to the server."}
            )

        subtotal, discount, total = (
            attrs["subtotal_minor"],
            attrs.get("discount_minor", 0),
            attrs["total_minor"],
        )
        if discount > subtotal:
            raise serializers.ValidationError(
                {"discount_minor": "Discount may not exceed the subtotal."}
            )
        if total != subtotal - discount:
            raise serializers.ValidationError(
                {"total_minor": f"Total must equal subtotal − discount ({subtotal - discount})."}
            )

        line_sum = sum(
            line["line_total_minor"] for line in attrs["lines"] if not line.get("is_void")
        )
        if line_sum != subtotal:
            raise serializers.ValidationError(
                {"subtotal_minor": f"Subtotal must equal the sum of live lines ({line_sum})."}
            )

        if status == Order.Status.CLOSED:
            paid = sum(payment["amount_minor"] for payment in attrs["payments"])
            if paid < total:
                raise serializers.ValidationError(
                    {
                        "payments": (
                            "An order cannot close while an amount is still due "
                            f"({total - paid} outstanding)."
                        )
                    }
                )
            if attrs.get("closed_at") is None:
                raise serializers.ValidationError({"closed_at": "A closed order needs a close time."})

        return attrs


class ShiftPushSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=Shift.Status.choices)
    cashier_id = serializers.UUIDField(required=False, allow_null=True)
    cashier_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    opened_at = serializers.DateTimeField()
    closed_at = serializers.DateTimeField(required=False, allow_null=True)
    opening_float_minor = MoneyField(required=False, default=0)
    expected_cash_minor = MoneyField()
    counted_cash_minor = MoneyField()
    variance_minor = MoneyField(allow_negative=True)
    variance_reason = serializers.CharField(max_length=240, required=False, allow_blank=True)
    created_at = serializers.DateTimeField(required=False)
    updated_at = serializers.DateTimeField(required=False)
    counts = CashCountSerializer(many=True)

    def validate(self, attrs):
        if attrs["status"] != Shift.Status.CLOSED:
            raise serializers.ValidationError(
                {"status": "Only closed shifts are pushed to the server."}
            )
        if attrs.get("closed_at") is None:
            raise serializers.ValidationError({"closed_at": "A closed shift needs a close time."})

        counted_rows = sum(row["line_total_minor"] for row in attrs["counts"])
        if counted_rows != attrs["counted_cash_minor"]:
            raise serializers.ValidationError(
                {"counted_cash_minor": f"Must equal the counted rows ({counted_rows})."}
            )

        expected_variance = attrs["counted_cash_minor"] - attrs["expected_cash_minor"]
        if attrs["variance_minor"] != expected_variance:
            raise serializers.ValidationError(
                {"variance_minor": f"Must equal counted − expected ({expected_variance})."}
            )

        tolerance = int(abs(attrs["expected_cash_minor"]) * settings.SHIFT_VARIANCE_TOLERANCE)
        if abs(attrs["variance_minor"]) > tolerance and not attrs.get("variance_reason", "").strip():
            raise serializers.ValidationError(
                {"variance_reason": "A variance beyond tolerance must carry a written reason."}
            )
        return attrs


RECORD_SERIALIZERS = {
    "order": OrderPushSerializer,
    "shift": ShiftPushSerializer,
    "price_change": PriceChangeSerializer,
    "availability": AvailabilityChangeSerializer,
}


class PushRecordSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=sorted(RECORD_SERIALIZERS))
    id = serializers.UUIDField()
    updated_at = serializers.DateTimeField(required=False)
    payload = serializers.DictField()

    def validate(self, attrs):
        payload_id = str(attrs["payload"].get("id", "")).lower()
        if payload_id != str(attrs["id"]).lower():
            raise serializers.ValidationError(
                {"id": "Envelope id and payload id must match."}
            )
        return attrs


class PushEnvelopeSerializer(serializers.Serializer):
    """The envelope's own shape — deliberately *not* its contents.

    Records are validated one at a time, by the view, so that a single bad row
    is reported as one rejected result instead of failing the whole request.
    Validating them here (with `child=PushRecordSerializer()`) made the batch
    all-or-nothing: one undeliverable record — a price change naming a menu item
    that only ever existed on the device, say — turned every push into a 400.
    The client reads that as "the network is down", so it reported itself
    offline, stopped trusting a perfectly good connection, and never synced
    another order. The per-record `results` contract exists precisely to avoid
    that, and this is what makes it real.
    """

    batch_id = serializers.UUIDField()
    records = serializers.ListField(child=serializers.DictField(), allow_empty=True)

    def validate_records(self, value):
        if len(value) > settings.SYNC_MAX_BATCH_RECORDS:
            raise serializers.ValidationError(
                f"A batch carries at most {settings.SYNC_MAX_BATCH_RECORDS} records; "
                "split it rather than truncating."
            )
        return value
