"""URL map.

Two audiences, two authentication schemes:

  /api/v1/sync/*      cashier tablets, `Authorization: Device <token>`
  everything else     manager dashboard, JWT in httpOnly cookies
"""
from __future__ import annotations

from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from config.media import serve_media
from config.spa import spa

from apps.accounts.staff import StaffViewSet
from apps.accounts.views import AuthViewSet, DeviceViewSet
from apps.audit.views import AuditLogViewSet
from apps.catalog.views import CategoryViewSet, MenuItemViewSet
from apps.customers.views import CustomerViewSet
from apps.orders.kitchen import KitchenViewSet
from apps.orders.public import PublicOrderView
from apps.orders.views import OrderViewSet
from apps.profiles.views import RestaurantProfileViewSet
from apps.profiles.views import PublicLandingView
from apps.shifts.views import ReportViewSet, ShiftViewSet
from apps.sync.views import SyncViewSet

router = DefaultRouter()
router.register("auth", AuthViewSet, basename="auth")
router.register("devices", DeviceViewSet, basename="device")
router.register("staff", StaffViewSet, basename="staff")
router.register("customers", CustomerViewSet, basename="customer")
router.register("audit/log", AuditLogViewSet, basename="audit-log")
router.register("sync", SyncViewSet, basename="sync")
router.register("catalog/categories", CategoryViewSet, basename="category")
router.register("catalog/items", MenuItemViewSet, basename="menu-item")
router.register("orders", OrderViewSet, basename="order")
router.register("kitchen/tickets", KitchenViewSet, basename="kitchen-ticket")
router.register("shifts", ShiftViewSet, basename="shift")
router.register("reports/revenue", ReportViewSet, basename="report-revenue")
router.register("profile", RestaurantProfileViewSet, basename="profile")


def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    # Server surfaces first; the frontend catch-all is last.
    path("admin/", admin.site.urls),
    path("healthz", health),
    # Placing a public delivery order. Registered before the slug landing route
    # so "order" is never mistaken for a restaurant slug.
    path("api/v1/public/order/", PublicOrderView.as_view()),
    # Public, no-auth landing data by slug — kept outside the router so it never
    # picks up the manager authentication the router endpoints carry.
    path("api/v1/public/<slug:slug>/", PublicLandingView.as_view()),
    # No slug: the single restaurant this server runs. Lets "/" be the landing
    # page without hardcoding a slug into the frontend build.
    path("api/v1/public/", PublicLandingView.as_view()),
    path("api/v1/", include(router.urls)),
    # Uploaded media (item photos, logo, hero), served by this same process in
    # the monolith — image files only, sandboxed (see config/media.py).
    re_path(
        r"^media/(?P<path>.*)$",
        serve_media,
        {"document_root": settings.MEDIA_ROOT},
    ),
    # Everything else is the exported frontend: /, /pos/*, /manager/*, /r/<slug>,
    # and its static assets. This must stay last so it never shadows the API.
    re_path(r"^(?P<path>.*)$", spa),
]
