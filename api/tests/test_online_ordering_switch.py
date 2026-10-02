"""Publishing the page and accepting orders are separate switches.

Until now a published landing page accepted delivery orders by the same flag,
so a restaurant could not show its menu without taking orders it was not ready
to collect. ``online_ordering_enabled`` is the second switch: off by default,
enforced by the server (a stale page or a direct API call cannot place an order
while it is off), and reported to the page so it can say ordering is closed.
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.orders.models import Order
from apps.profiles.models import RestaurantProfile
from tests.factories import make_branch, make_category, make_item, make_manager


class OnlineOrderingSwitchTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.manager = make_manager(branch=self.branch)
        self.item = make_item(branch=self.branch, category=make_category(branch=self.branch))
        self.staff = APIClient()
        self.staff.force_authenticate(self.manager)
        self.visitor = APIClient()

    def publish_page(self) -> RestaurantProfile:
        """A page published the way it always was — nothing said about ordering."""
        now = timezone.now()
        return RestaurantProfile.objects.create(
            id=uuid.uuid4(),
            branch=self.branch,
            slug="mataam",
            name_ar="مطعم",
            landing_page_enabled=True,
            created_at=now,
            updated_at=now,
        )

    def profile_body(self, profile, **over):
        body = {
            "id": str(profile.id),
            "slug": profile.slug,
            "name_ar": profile.name_ar,
            "landing_page_enabled": True,
        }
        body.update(over)
        return body

    def place_order(self):
        return self.visitor.post(
            "/api/v1/public/order/",
            {
                "customer_name": "أحمد",
                "customer_phone": "0912345678",
                "customer_address": "شارع النيل",
                "items": [{"item_id": str(self.item.id), "qty": 1}],
            },
            format="json",
        )

    def test_a_published_page_does_not_take_orders_until_switched_on(self):
        self.publish_page()
        response = self.place_order()
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["error"]["code"], "online_ordering_closed")
        self.assertFalse(Order.objects.filter(channel="online").exists())

    def test_the_page_and_menu_stay_public_while_ordering_is_off(self):
        self.publish_page()
        response = self.visitor.get("/api/v1/public/")
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["online_ordering_enabled"], False)
        self.assertTrue(response.data["menu"])

    def test_the_manager_switches_ordering_on(self):
        profile = self.publish_page()
        response = self.staff.put(
            f"/api/v1/profile/{profile.id}/",
            self.profile_body(profile, online_ordering_enabled=True),
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIs(response.data["online_ordering_enabled"], True)

        self.assertIs(self.visitor.get("/api/v1/public/").data["online_ordering_enabled"], True)
        self.assertEqual(self.place_order().status_code, 201)

    def test_switching_ordering_off_again_closes_it(self):
        profile = self.publish_page()
        self.staff.put(
            f"/api/v1/profile/{profile.id}/",
            self.profile_body(profile, online_ordering_enabled=True),
            format="json",
        )
        self.staff.put(
            f"/api/v1/profile/{profile.id}/",
            self.profile_body(profile, online_ordering_enabled=False),
            format="json",
        )
        self.assertEqual(self.place_order().status_code, 409)

    def test_a_profile_created_by_the_manager_starts_with_ordering_off(self):
        profile_id = uuid.uuid4()
        response = self.staff.post(
            "/api/v1/profile/",
            {"id": str(profile_id), "slug": "new-place", "name_ar": "مطعم جديد",
             "landing_page_enabled": True},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIs(response.data["online_ordering_enabled"], False)
        self.assertEqual(self.place_order().status_code, 409)

    def test_an_unpublished_page_still_takes_no_orders(self):
        profile = self.publish_page()
        self.staff.put(
            f"/api/v1/profile/{profile.id}/",
            self.profile_body(profile, landing_page_enabled=False, online_ordering_enabled=True),
            format="json",
        )
        self.assertEqual(self.place_order().status_code, 404)
