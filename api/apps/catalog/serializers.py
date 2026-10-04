from __future__ import annotations

from rest_framework import serializers

from apps.catalog.models import Category, MenuItem, PriceChange
from apps.core.fields import MoneyField


class CategorySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name_ar = serializers.CharField(max_length=120)
    name_en = serializers.CharField(max_length=120, required=False, allow_blank=True)
    sort = serializers.IntegerField(required=False, default=0)
    is_active = serializers.BooleanField(required=False, default=True)
    updated_at = serializers.DateTimeField(required=False)
    server_updated_at = serializers.DateTimeField(read_only=True)


class MenuItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    category_id = serializers.UUIDField()
    name_ar = serializers.CharField(max_length=160)
    name_en = serializers.CharField(max_length=160, required=False, allow_blank=True)
    description_ar = serializers.CharField(max_length=240, required=False, allow_blank=True)
    description_en = serializers.CharField(max_length=240, required=False, allow_blank=True)
    price_minor = MoneyField()
    is_available = serializers.BooleanField(required=False, default=True)
    is_active = serializers.BooleanField(required=False, default=True)
    is_featured = serializers.BooleanField(required=False, default=False)
    # Read-only, absolute so the same URL works from the app and the public page.
    # The upload itself goes through the dedicated `image` action, not this body.
    image_url = serializers.SerializerMethodField()
    sort = serializers.IntegerField(required=False, default=0)
    updated_at = serializers.DateTimeField(required=False)
    server_updated_at = serializers.DateTimeField(read_only=True)

    def get_image_url(self, obj):
        image = getattr(obj, "image", None)
        if not image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(image.url) if request else image.url

    def validate_category_id(self, value):
        if not Category.objects.filter(id=value).exists():
            raise serializers.ValidationError("Unknown category.")
        return value


class AvailabilityChangeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    item_id = serializers.UUIDField()
    is_available = serializers.BooleanField()
    changed_at = serializers.DateTimeField()
    created_at = serializers.DateTimeField(required=False)
    updated_at = serializers.DateTimeField(required=False)


class PriceChangeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    item_id = serializers.UUIDField()
    old_price_minor = MoneyField()
    new_price_minor = MoneyField()
    reason = serializers.ChoiceField(
        choices=PriceChange.Reason.choices, default=PriceChange.Reason.MANUAL
    )
    percent = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )
    applied_at = serializers.DateTimeField()
    created_at = serializers.DateTimeField(required=False)
    updated_at = serializers.DateTimeField(required=False)

    def validate_item_id(self, value):
        if not MenuItem.objects.filter(id=value).exists():
            raise serializers.ValidationError("Unknown menu item.")
        return value
