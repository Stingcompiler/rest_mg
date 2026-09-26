"""Restaurant profile.

Stored now, rendered later. `/r/[slug]` is not built in this phase; the only
requirement is that everything the public page will need already exists here, so
building it later is a rendering job and not a migration.
"""
from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class RestaurantProfile(BaseModel):
    slug = models.SlugField(max_length=80, unique=True)

    name_ar = models.CharField(max_length=160)
    name_en = models.CharField(max_length=160, blank=True)
    description_ar = models.CharField(max_length=300, blank=True)
    description_en = models.CharField(max_length=300, blank=True)
    address_ar = models.CharField(max_length=240, blank=True)
    address_en = models.CharField(max_length=240, blank=True)

    phone = models.CharField(max_length=32, blank=True)
    whatsapp = models.CharField(max_length=32, blank=True)
    map_url = models.URLField(blank=True)

    # The two images the landing page is built around, uploaded by the manager
    # rather than baked into the build. Both optional: the page falls back to
    # the restaurant's name in type when there is no logo, and to a plain
    # coloured band when there is no hero, so a half-filled profile still
    # publishes something presentable.
    logo = models.ImageField(upload_to="branding/", null=True, blank=True)
    hero_image = models.ImageField(upload_to="branding/", null=True, blank=True)

    # [{"day_ar": "السبت – الخميس", "day_en": "Sat – Thu", "open": "08:00", "close": "23:00"}]
    hours = models.JSONField(default=list, blank=True)
    # [{"url": "...", "alt_ar": "...", "alt_en": "...", "role": "hero|dish|map"}]
    photos = models.JSONField(default=list, blank=True)
    # [{"provider": "terhaga", "url": "...", "enabled": true}]
    delivery_links = models.JSONField(default=list, blank=True)

    landing_page_enabled = models.BooleanField(default=False)
    prices_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name_ar"]

    def __str__(self) -> str:
        return self.name_ar
