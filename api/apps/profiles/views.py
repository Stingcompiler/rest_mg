"""Restaurant profile — the manager editor, and the public landing endpoint."""
from __future__ import annotations

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.permissions import IsManager
from apps.audit import services as audit
from apps.audit.models import AuditLog
from apps.catalog.models import Category, MenuItem
from apps.profiles.models import RestaurantProfile
from apps.profiles.serializers import RestaurantProfileSerializer

_WRITABLE = [
    "slug",
    "name_ar",
    "name_en",
    "description_ar",
    "description_en",
    "address_ar",
    "address_en",
    "phone",
    "whatsapp",
    "map_url",
    "hours",
    "photos",
    "delivery_links",
    "landing_page_enabled",
]


class RestaurantProfileViewSet(viewsets.ViewSet):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsManager]
    # Multipart for the branding upload; JSON still handles everything else.
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def list(self, request):
        profiles = RestaurantProfile.objects.all()
        if request.user.branch_id:
            profiles = profiles.filter(branch_id__in=[request.user.branch_id, None])
        return Response(
            RestaurantProfileSerializer(profiles, many=True, context={'request': request}).data
        )

    def retrieve(self, request, pk=None):
        profile = RestaurantProfile.objects.filter(id=pk).first()
        if profile is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown profile."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(RestaurantProfileSerializer(profile, context={'request': request}).data)

    def create(self, request):
        payload = RestaurantProfileSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        now = timezone.now()
        profile = RestaurantProfile.objects.create(
            id=data["id"],
            branch=request.user.branch,
            created_at=now,
            updated_at=data.get("updated_at") or now,
            **{field: data.get(field, "" if field != "landing_page_enabled" else False)
               for field in _WRITABLE if field not in {"hours", "photos", "delivery_links"}},
            hours=data.get("hours", []),
            photos=data.get("photos", []),
            delivery_links=data.get("delivery_links", []),
        )
        return Response(RestaurantProfileSerializer(profile).data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        profile = RestaurantProfile.objects.filter(id=pk).first()
        if profile is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown profile."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        payload = RestaurantProfileSerializer(data=request.data)
        payload.instance = profile
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        for field in _WRITABLE:
            if field in data:
                setattr(profile, field, data[field])
        profile.updated_at = timezone.now()
        profile.save()
        return Response(RestaurantProfileSerializer(profile, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="branding")
    def branding(self, request, pk=None):
        """Upload the landing page's logo or hero image (multipart).

        Its own action, like the menu item's photo, so the JSON body stays clean
        and one image can be replaced without resubmitting the whole profile.
        Sending an empty value for a slot clears it, which is how a manager
        removes a logo rather than being stuck with the first one they picked.

        That the file is a real image is Django's judgement, via ImageField.
        """
        profile = RestaurantProfile.objects.filter(id=pk).first()
        if profile is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown profile."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        slots = {"logo": "logo", "hero_image": "hero_image"}
        touched = []
        for field in slots:
            if field in request.FILES:
                setattr(profile, field, request.FILES[field])
                touched.append(field)
            elif request.data.get(f"clear_{field}") in ("true", "1", True):
                setattr(profile, field, None)
                touched.append(field)

        if not touched:
            return Response(
                {
                    "error": {
                        "code": "validation_error",
                        "message": "Send a logo or hero_image file, or clear_<field>=true.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile.updated_at = timezone.now()
        profile.save()
        audit.record(
            action=AuditLog.Action.PROFILE_BRANDING,
            actor=request.user,
            target=profile,
            target_label=profile.name_ar,
            metadata={"changed": touched},
        )
        return Response(RestaurantProfileSerializer(profile, context={"request": request}).data)


class PublicLandingView(APIView):
    """The public landing page's data source. No auth — a visitor, not a user.

    Returns a profile and its available menu only when the manager has published
    the page (``landing_page_enabled``). Everything here is already stored; this
    is the read side of the "prepare, do not build" landing page. It renders from
    last-synced data, which is why prices carry the timestamp of their last
    update.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request, slug=None):
        published = RestaurantProfile.objects.filter(landing_page_enabled=True)
        # Without a slug this serves the one restaurant this server runs, so the
        # site root can be the landing page with no slug baked into the build.
        profile = published.filter(slug=slug).first() if slug else published.first()
        if profile is None:
            return Response(
                {"error": {"code": "not_found", "message": "No published page at this address."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        branch_scope = [profile.branch_id, None]
        categories = Category.objects.filter(
            is_active=True, branch_id__in=branch_scope
        ).order_by("sort", "name_ar")
        items = MenuItem.objects.filter(
            is_active=True, is_available=True, branch_id__in=branch_scope
        ).order_by("sort", "name_ar")

        def item_json(item):
            # An absolute image URL so the same string works from any origin the
            # visitor loaded the page on; None when the item has no photo yet.
            image_url = request.build_absolute_uri(item.image.url) if item.image else None
            return {
                "id": str(item.id),
                "category_id": str(item.category_id),
                "name_ar": item.name_ar,
                "name_en": item.name_en,
                "description_ar": item.description_ar,
                "price_minor": str(item.price_minor),
                "is_available": item.is_available,
                "is_featured": item.is_featured,
                "image_url": image_url,
            }

        items_by_category: dict[str, list] = {}
        for item in items:
            items_by_category.setdefault(str(item.category_id), []).append(item_json(item))

        menu = [
            {
                "id": str(category.id),
                "name_ar": category.name_ar,
                "name_en": category.name_en,
                "items": items_by_category.get(str(category.id), []),
            }
            for category in categories
            if items_by_category.get(str(category.id))
        ]

        # The curated "featured / most-ordered" shelf, in menu order.
        featured = [item_json(item) for item in items if item.is_featured]

        return Response(
            {
                "name_ar": profile.name_ar,
                "name_en": profile.name_en,
                "description_ar": profile.description_ar,
                "description_en": profile.description_en,
                "address_ar": profile.address_ar,
                "address_en": profile.address_en,
                "phone": profile.phone,
                "whatsapp": profile.whatsapp,
                "map_url": profile.map_url,
                # The manager's own branding, absolute so it loads from whatever
                # origin the visitor opened. None when not uploaded yet — the
                # page is built to look finished without either of them.
                "logo_url": (
                    request.build_absolute_uri(profile.logo.url) if profile.logo else None
                ),
                "hero_image_url": (
                    request.build_absolute_uri(profile.hero_image.url)
                    if profile.hero_image
                    else None
                ),
                "hours": profile.hours,
                "photos": profile.photos,
                "delivery_links": profile.delivery_links,
                "prices_updated_at": profile.prices_updated_at,
                "menu": menu,
                "featured": featured,
            }
        )
