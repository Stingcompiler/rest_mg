from __future__ import annotations

import re

from rest_framework import serializers

from apps.profiles.models import RestaurantProfile


_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_HOURS_FIELDS = {"days", "open", "close", "day_ar", "day_en"}
# A row a day, and a split (lunch, then dinner) for each.
_MAX_HOURS_ROWS = 14


def validate_hours_rows(rows):
    """Opening hours the public page can read (batch 23).

    A row carries ``days`` (0 = Sunday … 6 = Saturday, as a browser's
    ``getDay``) and HH:MM times; a closing time before the opening one is a
    late night that ends after midnight. Rows saved before ``days`` existed
    have only labels and times, and still load: they show, they just cannot
    say "open now".
    """
    if len(rows) > _MAX_HOURS_ROWS:
        raise serializers.ValidationError(f"At most {_MAX_HOURS_ROWS} rows of hours.")
    for index, row in enumerate(rows):
        unknown = set(row) - _HOURS_FIELDS
        if unknown:
            raise serializers.ValidationError(f"Row {index}: unknown field {sorted(unknown)[0]}.")
        for field in ("open", "close"):
            value = row.get(field)
            if value is not None and (not isinstance(value, str) or not _TIME.match(value)):
                raise serializers.ValidationError(f"Row {index}: {field} must be HH:MM.")
        for field in ("day_ar", "day_en"):
            if field in row and not isinstance(row[field], str):
                raise serializers.ValidationError(f"Row {index}: {field} must be text.")
        if "days" not in row:
            continue
        days = row["days"]
        if (
            not isinstance(days, list)
            or not days
            or any(type(day) is not int or not 0 <= day <= 6 for day in days)
            or len(set(days)) != len(days)
        ):
            raise serializers.ValidationError(f"Row {index}: days must be distinct numbers 0–6.")
        if "open" not in row or "close" not in row:
            raise serializers.ValidationError(f"Row {index}: a row with days needs both times.")
    return rows


class RestaurantProfileSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    slug = serializers.SlugField(max_length=80)
    name_ar = serializers.CharField(max_length=160)
    name_en = serializers.CharField(max_length=160, required=False, allow_blank=True)
    description_ar = serializers.CharField(max_length=300, required=False, allow_blank=True)
    description_en = serializers.CharField(max_length=300, required=False, allow_blank=True)
    address_ar = serializers.CharField(max_length=240, required=False, allow_blank=True)
    address_en = serializers.CharField(max_length=240, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    whatsapp = serializers.CharField(max_length=32, required=False, allow_blank=True)
    map_url = serializers.URLField(required=False, allow_blank=True)
    hours = serializers.ListField(child=serializers.DictField(), required=False)
    photos = serializers.ListField(child=serializers.DictField(), required=False)
    delivery_links = serializers.ListField(child=serializers.DictField(), required=False)
    # Read-only and absolute, so the same string works from the manager app and
    # from a visitor's phone on the public page. The files themselves go up
    # through the dedicated `branding` action, never in this body.
    logo_url = serializers.SerializerMethodField()
    hero_image_url = serializers.SerializerMethodField()
    landing_page_enabled = serializers.BooleanField(required=False, default=False)
    online_ordering_enabled = serializers.BooleanField(required=False, default=False)
    prices_updated_at = serializers.DateTimeField(required=False, allow_null=True)
    updated_at = serializers.DateTimeField(required=False)
    server_updated_at = serializers.DateTimeField(read_only=True)

    def _absolute(self, field):
        if not field:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(field.url) if request else field.url

    def get_logo_url(self, obj):
        return self._absolute(getattr(obj, "logo", None))

    def get_hero_image_url(self, obj):
        return self._absolute(getattr(obj, "hero_image", None))

    def validate_hours(self, value):
        return validate_hours_rows(value)

    def validate_slug(self, value):
        clashes = RestaurantProfile.objects.filter(slug=value)
        if self.instance is not None:
            clashes = clashes.exclude(id=self.instance.id)
        if clashes.exists():
            raise serializers.ValidationError("This slug is already taken.")
        return value
