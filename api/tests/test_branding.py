"""The logo and hero image the manager controls.

The landing page is the restaurant's face to a customer with a phone. Both
images are the manager's to set and to change, so they are uploaded like a menu
item's photo — through their own action, not by resubmitting the whole profile —
and they reach the public page without anyone touching a build.

Both are optional on purpose: a half-filled profile still has to publish
something presentable, so these tests hold that "no logo yet" answers null
rather than failing.
"""
from __future__ import annotations

import io
import uuid

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.profiles.models import RestaurantProfile
from tests.factories import make_branch, make_manager


def a_png(colour: str = "red") -> SimpleUploadedFile:
    """A real 1x1 PNG. ImageField verifies the bytes, so a fake will not pass."""
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (1, 1), colour).save(buffer, format="PNG")
    return SimpleUploadedFile(f"{colour}.png", buffer.getvalue(), content_type="image/png")


class BrandingTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch()
        make_manager(branch=self.branch, display_name="المدير")
        now = timezone.now()
        self.profile = RestaurantProfile.objects.create(
            id=uuid.uuid4(),
            branch=self.branch,
            slug="wisam",
            name_ar="مطعم وسام الشام",
            landing_page_enabled=True,
            created_at=now,
            updated_at=now,
        )
        self.client = APIClient()
        self.client.post("/api/v1/auth/login/",
                         {"username": "manager", "password": "correct-horse-battery"},
                         format="json")

    def upload(self, **files):
        return self.client.post(
            f"/api/v1/profile/{self.profile.id}/branding/", files, format="multipart"
        )


class BrandingUploadTests(BrandingTestCase):
    def test_a_manager_sets_the_logo(self):
        response = self.upload(logo=a_png())
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["logo_url"])
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.logo)

    def test_a_manager_sets_the_hero(self):
        response = self.upload(hero_image=a_png("blue"))
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["hero_image_url"])

    def test_both_can_go_up_together(self):
        response = self.upload(logo=a_png(), hero_image=a_png("blue"))
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["logo_url"])
        self.assertIsNotNone(response.data["hero_image_url"])

    def test_replacing_one_leaves_the_other_alone(self):
        self.upload(logo=a_png(), hero_image=a_png("blue"))
        before = RestaurantProfile.objects.get(id=self.profile.id).hero_image.name

        self.upload(logo=a_png("green"))

        after = RestaurantProfile.objects.get(id=self.profile.id)
        self.assertEqual(after.hero_image.name, before)

    def test_a_slot_can_be_cleared(self):
        # A manager who picked the wrong logo must be able to remove it, not
        # only replace it with another.
        self.upload(logo=a_png())
        response = self.client.post(
            f"/api/v1/profile/{self.profile.id}/branding/",
            {"clear_logo": "true"},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["logo_url"])

    def test_an_empty_request_is_refused_rather_than_silently_doing_nothing(self):
        response = self.client.post(
            f"/api/v1/profile/{self.profile.id}/branding/", {}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_a_cashier_cannot_change_the_restaurant_s_face(self):
        make_manager(branch=self.branch, username="c.brand", role=ManagerUser.Role.CASHIER,
                     password="brand-pass-123")
        cashier = APIClient()
        cashier.post("/api/v1/auth/login/",
                     {"username": "c.brand", "password": "brand-pass-123"}, format="json")
        response = cashier.post(
            f"/api/v1/profile/{self.profile.id}/branding/", {"logo": a_png()}, format="multipart"
        )
        self.assertEqual(response.status_code, 403)

    def test_the_change_is_recorded(self):
        from apps.audit.models import AuditLog

        self.upload(logo=a_png())
        entry = AuditLog.objects.filter(action=AuditLog.Action.PROFILE_BRANDING).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.metadata["changed"], ["logo"])


class BrandingOnThePublicPageTests(BrandingTestCase):
    def test_the_visitor_gets_both_images(self):
        self.upload(logo=a_png(), hero_image=a_png("blue"))
        body = APIClient().get("/api/v1/public/wisam/").data
        self.assertIsNotNone(body["logo_url"])
        self.assertIsNotNone(body["hero_image_url"])
        # Absolute, so the same string works from a phone on any origin.
        self.assertTrue(body["logo_url"].startswith("http"))

    def test_a_page_with_no_branding_still_publishes(self):
        # The page must look finished before the manager has uploaded anything.
        body = APIClient().get("/api/v1/public/wisam/").data
        self.assertIsNone(body["logo_url"])
        self.assertIsNone(body["hero_image_url"])
        self.assertEqual(body["name_ar"], "مطعم وسام الشام")
