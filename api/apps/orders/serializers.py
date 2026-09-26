"""Read serializers for the manager dashboard, plus the shared line/payment shapes."""
from __future__ import annotations

from rest_framework import serializers

from apps.core.fields import MoneyField
from apps.orders.models import Order, OrderLine, Payment


class OrderLineSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    item_id = serializers.UUIDField(required=False, allow_null=True)
    name_ar = serializers.CharField(max_length=160)
    name_en = serializers.CharField(max_length=160, required=False, allow_blank=True)
    unit_price_minor = MoneyField()
    qty = serializers.IntegerField(min_value=1)
    modifiers_text = serializers.CharField(max_length=240, required=False, allow_blank=True)
    line_total_minor = MoneyField()
    is_void = serializers.BooleanField(required=False, default=False)
    void_reason = serializers.CharField(max_length=240, required=False, allow_blank=True)
    created_at = serializers.DateTimeField(required=False)
    updated_at = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        expected = attrs["unit_price_minor"] * attrs["qty"]
        if attrs["line_total_minor"] != expected:
            raise serializers.ValidationError(
                {"line_total_minor": f"Line total must equal unit price × qty ({expected})."}
            )
        return attrs


class PaymentSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    amount_minor = MoneyField()
    tendered_minor = MoneyField(required=False, allow_null=True)
    change_minor = MoneyField(required=False, default=0)
    reference = serializers.CharField(max_length=80, required=False, allow_blank=True)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    taken_at = serializers.DateTimeField()
    created_at = serializers.DateTimeField(required=False)
    updated_at = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        method = attrs["method"]
        if method in {Payment.Method.BANK, Payment.Method.WALLET} and not attrs.get(
            "reference", ""
        ).strip():
            raise serializers.ValidationError(
                {"reference": f"A {method} payment must carry a reference."}
            )
        if method == Payment.Method.CREDIT and not attrs.get("customer_id"):
            raise serializers.ValidationError(
                {"customer_id": "A credit payment must name the customer who owes it."}
            )
        tendered = attrs.get("tendered_minor")
        if tendered is not None:
            expected_change = max(tendered - attrs["amount_minor"], 0)
            if attrs.get("change_minor", 0) != expected_change:
                raise serializers.ValidationError(
                    {"change_minor": f"Change must equal tendered − amount ({expected_change})."}
                )
        return attrs


class OrderReadSerializer(serializers.Serializer):
    """Manager-facing representation. Read-only: the API never edits an order."""

    id = serializers.UUIDField(read_only=True)
    number = serializers.CharField(read_only=True)
    type = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    table_id = serializers.UUIDField(read_only=True, allow_null=True)
    customer_id = serializers.UUIDField(read_only=True, allow_null=True)
    subtotal_minor = MoneyField(read_only=True)
    discount_minor = MoneyField(read_only=True)
    total_minor = MoneyField(read_only=True)
    amount_paid_minor = MoneyField(read_only=True)
    amount_due_minor = MoneyField(read_only=True)
    opened_at = serializers.DateTimeField(read_only=True)
    sent_at = serializers.DateTimeField(read_only=True, allow_null=True)
    closed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    cashier_name = serializers.CharField(read_only=True)
    shift_ref = serializers.UUIDField(read_only=True, allow_null=True)
    synced_at = serializers.DateTimeField(read_only=True, allow_null=True)
    # Provenance and delivery — blank for an ordinary POS order, populated for a
    # public delivery order so the dashboard can process it.
    channel = serializers.CharField(read_only=True)
    kitchen_status = serializers.CharField(read_only=True)
    delivery_status = serializers.CharField(read_only=True)
    customer_name = serializers.CharField(read_only=True)
    customer_phone = serializers.CharField(read_only=True)
    customer_address = serializers.CharField(read_only=True)
    customer_area = serializers.CharField(read_only=True)
    customer_notes = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    lines = OrderLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)

    @staticmethod
    def queryset():
        return Order.objects.prefetch_related("lines", "payments").select_related("shift")
