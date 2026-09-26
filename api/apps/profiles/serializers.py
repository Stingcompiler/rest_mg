from __future__ import annotations

from rest_framework import serializers

from apps.profiles.models import RestaurantProfile


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

    def validate_slug(self, value):
        clashes = RestaurantProfile.objects.filter(slug=value)
        if self.instance is not None:
            clashes = clashes.exclude(id=self.instance.id)
        if clashes.exists():
            raise serializers.ValidationError("This slug is already taken.")
        return value
