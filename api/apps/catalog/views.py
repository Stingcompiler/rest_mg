"""Catalogue admin. Explicit ViewSets, hand-written actions.

Editable by owner, manager, or cashier (see IsCatalogEditor) — widened from the
former manager-only rule so the person at the till can maintain the menu.
"""
from __future__ import annotations

import uuid

from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.permissions import IsCatalogEditor
from apps.audit import services as audit
from apps.audit.models import AuditLog
from apps.catalog.models import Category, MenuItem, PriceChange
from apps.catalog.serializers import CategorySerializer, MenuItemSerializer


def _serialize_item(item, request):
    """MenuItem with its image URL made absolute for whichever origin asked."""
    return MenuItemSerializer(item, context={"request": request}).data


class CategoryViewSet(viewsets.ViewSet):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsCatalogEditor]

    def list(self, request):
        categories = Category.objects.filter(is_active=True)
        return Response(CategorySerializer(categories, many=True).data)

    def retrieve(self, request, pk=None):
        category = Category.objects.filter(id=pk).first()
        if category is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown category."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(CategorySerializer(category).data)

    def create(self, request):
        payload = CategorySerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        now = timezone.now()
        category = Category.objects.create(
            id=data["id"],
            branch=request.user.branch,
            name_ar=data["name_ar"],
            name_en=data.get("name_en", ""),
            sort=data.get("sort", 0),
            is_active=data.get("is_active", True),
            created_at=now,
            updated_at=data.get("updated_at") or now,
        )
        audit.record(
            action=AuditLog.Action.CATEGORY_CREATED,
            actor=request.user,
            target=category,
            target_label=category.name_ar,
        )
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        category = Category.objects.filter(id=pk).first()
        if category is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown category."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        payload = CategorySerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        category.name_ar = data["name_ar"]
        category.name_en = data.get("name_en", "")
        category.sort = data.get("sort", category.sort)
        category.is_active = data.get("is_active", category.is_active)
        category.updated_at = timezone.now()
        category.save()
        audit.record(
            action=AuditLog.Action.CATEGORY_UPDATED,
            actor=request.user,
            target=category,
            target_label=category.name_ar,
        )
        return Response(CategorySerializer(category).data)

    def destroy(self, request, pk=None):
        """No hard deletes. A category leaves the menu by going inactive."""
        category = Category.objects.filter(id=pk).first()
        if category is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown category."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        category.is_active = False
        category.updated_at = timezone.now()
        category.save(update_fields=["is_active", "updated_at", "server_updated_at"])
        audit.record(
            action=AuditLog.Action.CATEGORY_DEACTIVATED,
            actor=request.user,
            target=category,
            target_label=category.name_ar,
        )
        return Response(CategorySerializer(category).data)


class MenuItemViewSet(viewsets.ViewSet):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsCatalogEditor]
    # Accept multipart so the image action can carry an uploaded file; JSON still
    # works for the create/update body.
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def list(self, request):
        items = MenuItem.objects.select_related("category")
        if request.query_params.get("category"):
            items = items.filter(category_id=request.query_params["category"])
        if request.query_params.get("include_retired") != "true":
            items = items.filter(is_active=True)
        return Response(MenuItemSerializer(items, many=True, context={"request": request}).data)

    def retrieve(self, request, pk=None):
        item = MenuItem.objects.filter(id=pk).first()
        if item is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown item."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(_serialize_item(item, request))

    def create(self, request):
        payload = MenuItemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        now = timezone.now()
        item = MenuItem.objects.create(
            id=data["id"],
            branch=request.user.branch,
            category_id=data["category_id"],
            name_ar=data["name_ar"],
            name_en=data.get("name_en", ""),
            description_ar=data.get("description_ar", ""),
            description_en=data.get("description_en", ""),
            price_minor=data["price_minor"],
            is_available=data.get("is_available", True),
            is_active=data.get("is_active", True),
            is_featured=data.get("is_featured", False),
            sort=data.get("sort", 0),
            created_at=now,
            updated_at=data.get("updated_at") or now,
        )
        audit.record(
            action=AuditLog.Action.ITEM_CREATED,
            actor=request.user,
            target=item,
            target_label=item.name_ar,
            metadata={"price_minor": str(item.price_minor)},
        )
        return Response(_serialize_item(item, request), status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        item = MenuItem.objects.filter(id=pk).first()
        if item is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown item."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        payload = MenuItemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        now = timezone.now()

        before = {
            "name_ar": item.name_ar,
            "price_minor": str(item.price_minor),
            "is_available": item.is_available,
            "is_featured": item.is_featured,
        }
        old_price = item.price_minor
        item.category_id = data["category_id"]
        item.name_ar = data["name_ar"]
        item.name_en = data.get("name_en", "")
        item.description_ar = data.get("description_ar", "")
        item.description_en = data.get("description_en", "")
        item.price_minor = data["price_minor"]
        item.is_available = data.get("is_available", item.is_available)
        item.is_active = data.get("is_active", item.is_active)
        item.is_featured = data.get("is_featured", item.is_featured)
        item.sort = data.get("sort", item.sort)
        item.updated_at = now

        with transaction.atomic():
            item.save()
            if old_price != item.price_minor:
                # Every price movement is auditable, wherever it originated.
                PriceChange.objects.create(
                    id=uuid.uuid4(),
                    branch=item.branch,
                    item=item,
                    old_price_minor=old_price,
                    new_price_minor=item.price_minor,
                    reason=PriceChange.Reason.MANUAL,
                    applied_at=now,
                    created_at=now,
                    updated_at=now,
                )
        after = {
            "name_ar": item.name_ar,
            "price_minor": str(item.price_minor),
            "is_available": item.is_available,
            "is_featured": item.is_featured,
        }
        changes = {k: [before[k], after[k]] for k in before if before[k] != after[k]}
        if changes:
            audit.record(
                action=AuditLog.Action.ITEM_UPDATED,
                actor=request.user,
                target=item,
                target_label=item.name_ar,
                metadata=changes,
            )
        return Response(_serialize_item(item, request))

    def destroy(self, request, pk=None):
        item = MenuItem.objects.filter(id=pk).first()
        if item is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown item."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        item.retire()
        audit.record(
            action=AuditLog.Action.ITEM_RETIRED,
            actor=request.user,
            target=item,
            target_label=item.name_ar,
        )
        return Response(_serialize_item(item, request))

    @action(detail=True, methods=["post"], url_path="image")
    def image(self, request, pk=None):
        """Upload or replace an item's photo (multipart, field ``image``).

        Kept as its own action so the JSON create/update body stays clean and a
        photo can be changed without resubmitting the whole item. Validation of
        the file being a real image is Django's, via ImageField.
        """
        item = MenuItem.objects.filter(id=pk).first()
        if item is None:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown item."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        upload = request.FILES.get("image")
        if upload is None:
            return Response(
                {"error": {"code": "validation_error", "message": "No image file provided."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        item.image = upload
        item.updated_at = timezone.now()
        item.save(update_fields=["image", "updated_at", "server_updated_at"])
        audit.record(
            action=AuditLog.Action.ITEM_IMAGE,
            actor=request.user,
            target=item,
            target_label=item.name_ar,
        )
        return Response(_serialize_item(item, request))

    @action(detail=False, methods=["post"], url_path="bulk-price")
    def bulk_price(self, request):
        """Raise or lower a whole category by a percentage.

        One PriceChange row per item, so the trail shows what each item's price
        actually was before the sweep.
        """
        category_id = request.data.get("category_id")
        try:
            percent = float(request.data.get("percent"))
        except (TypeError, ValueError):
            return Response(
                {"error": {"code": "validation_error", "message": "percent must be a number."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items = MenuItem.objects.filter(is_active=True)
        if category_id:
            items = items.filter(category_id=category_id)

        now = timezone.now()
        changed = []
        with transaction.atomic():
            for item in items:
                old_price = item.price_minor
                new_price = int(round(old_price * (1 + percent / 100)))
                if new_price == old_price:
                    continue
                item.price_minor = new_price
                item.updated_at = now
                item.save(update_fields=["price_minor", "updated_at", "server_updated_at"])
                PriceChange.objects.create(
                    id=uuid.uuid4(),
                    branch=item.branch,
                    item=item,
                    old_price_minor=old_price,
                    new_price_minor=new_price,
                    reason=PriceChange.Reason.BULK_PERCENT,
                    percent=percent,
                    applied_at=now,
                    created_at=now,
                    updated_at=now,
                )
                changed.append(item)

        return Response({"changed": len(changed), "items": MenuItemSerializer(changed, many=True).data})
