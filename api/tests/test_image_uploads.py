"""Uploaded images are decoded, re-encoded and served inert (review finding F03).

Assigning an upload to an ImageField and saving the model runs no image
validation, so the review could upload an HTML file as a menu photo — from a
cashier account too — and have it served back as ``text/html`` on the app's own
origin. These tests hold the server to checking every upload itself (item photo,
logo, hero image), storing only what it re-encoded under a name it chose, and
the media route to serving image types only, sandboxed.

Rejecting a file and refusing access to another branch's item are different
answers (400 and 404); the second belongs to branch isolation (F02), so every
upload here targets an item of the uploader's own branch.
"""
from __future__ import annotations

import io
import os
import uuid
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import ManagerUser
from apps.profiles.models import RestaurantProfile
from tests.factories import make_branch, make_category, make_item, make_manager

HTML = b"<!doctype html><html><body>audit only</body></html>"
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>void 0</script></svg>'


def image_bytes(fmt: str = "PNG", size=(4, 3), mode: str = "RGB", colour="red") -> bytes:
    buffer = io.BytesIO()
    Image.new(mode, size, colour).save(buffer, format=fmt)
    return buffer.getvalue()


def noisy_png(side: int = 64) -> bytes:
    """A PNG that does not compress away, for size limits."""
    buffer = io.BytesIO()
    Image.frombytes("RGB", (side, side), os.urandom(side * side * 3)).save(buffer, format="PNG")
    return buffer.getvalue()


def a_file(name: str, content: bytes, content_type: str = "image/png") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content, content_type=content_type)


def stored(field) -> Image.Image:
    with field.open("rb") as handle:
        image = Image.open(handle)
        image.load()
        return image


class UploadTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.manager = make_manager(branch=self.branch)
        self.cashier = make_manager(
            branch=self.branch, username="cashier", role=ManagerUser.Role.CASHIER
        )
        self.item = make_item(branch=self.branch, category=make_category(branch=self.branch))
        self.client = self.client_for(self.manager)

    @staticmethod
    def client_for(user) -> APIClient:
        client = APIClient()
        client.force_authenticate(user)
        return client

    def upload_photo(self, upload, client=None):
        return (client or self.client).post(
            f"/api/v1/catalog/items/{self.item.id}/image/", {"image": upload}, format="multipart"
        )

    def assert_rejected(self, response):
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data["error"]["code"], "invalid_image")


class ItemPhotoRejectionTests(UploadTestCase):
    def test_html_is_rejected_and_the_previous_photo_kept(self):
        self.assertEqual(self.upload_photo(a_file("dish.png", image_bytes())).status_code, 200)
        self.item.refresh_from_db()
        before = self.item.image.name

        self.assert_rejected(self.upload_photo(a_file("audit.html", HTML, "text/html")))
        self.item.refresh_from_db()
        self.assertEqual(self.item.image.name, before)

    def test_a_cashier_cannot_upload_html(self):
        response = self.upload_photo(
            a_file("audit.html", HTML, "text/html"), client=self.client_for(self.cashier)
        )
        self.assert_rejected(response)
        self.item.refresh_from_db()
        self.assertFalse(self.item.image)

    def test_text_named_like_an_image_is_rejected(self):
        self.assert_rejected(self.upload_photo(a_file("dish.png", HTML)))

    def test_svg_is_rejected(self):
        self.assert_rejected(self.upload_photo(a_file("dish.svg", SVG, "image/svg+xml")))

    def test_a_format_outside_the_allowed_set_is_rejected(self):
        self.assert_rejected(self.upload_photo(a_file("dish.gif", image_bytes("GIF"), "image/gif")))

    @override_settings(IMAGE_UPLOAD_MAX_BYTES=1_000)
    def test_a_file_over_the_size_limit_is_rejected(self):
        self.assert_rejected(self.upload_photo(a_file("dish.png", noisy_png())))

    @override_settings(IMAGE_UPLOAD_MAX_PIXELS=100)
    def test_an_image_over_the_pixel_limit_is_rejected(self):
        self.assert_rejected(self.upload_photo(a_file("dish.png", image_bytes(size=(20, 20)))))


class ItemPhotoStorageTests(UploadTestCase):
    def test_the_stored_name_is_the_servers_not_the_uploaders(self):
        # A real PNG sent under an HTML name and type is still a PNG.
        response = self.upload_photo(a_file("audit.html", image_bytes(), "text/html"))
        self.assertEqual(response.status_code, 200, response.data)
        self.item.refresh_from_db()
        name = Path(self.item.image.name)
        self.assertEqual(name.parent.name, "menu-items")
        self.assertNotIn("audit", name.name)
        self.assertIn(name.suffix, {".jpg", ".png"})

    def test_an_opaque_photo_is_stored_as_jpeg(self):
        self.upload_photo(a_file("dish.png", image_bytes()))
        self.item.refresh_from_db()
        self.assertTrue(self.item.image.name.endswith(".jpg"))
        self.assertEqual(stored(self.item.image).format, "JPEG")

    def test_a_transparent_photo_stays_png(self):
        self.upload_photo(a_file("dish.png", image_bytes(mode="RGBA", colour=(255, 0, 0, 0))))
        self.item.refresh_from_db()
        self.assertTrue(self.item.image.name.endswith(".png"))
        self.assertEqual(stored(self.item.image).format, "PNG")

    def test_a_large_photo_is_scaled_down(self):
        self.upload_photo(a_file("dish.jpg", image_bytes("JPEG", size=(3000, 1500)), "image/jpeg"))
        self.item.refresh_from_db()
        self.assertEqual(stored(self.item.image).size, (1200, 600))


class MediaServingTests(UploadTestCase):
    def test_an_uploaded_photo_is_served_as_an_inert_image(self):
        self.upload_photo(a_file("dish.png", image_bytes()))
        self.item.refresh_from_db()

        response = APIClient().get(self.item.image.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/jpeg")
        self.assertIn("sandbox", response["Content-Security-Policy"])
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        response.close()

    def test_a_non_image_file_in_media_is_never_served(self):
        folder = Path(settings.MEDIA_ROOT) / "menu-items"
        folder.mkdir(parents=True, exist_ok=True)
        for name, content in (("planted.html", HTML), ("planted.svg", SVG)):
            (folder / name).write_bytes(content)
            response = APIClient().get(f"/media/menu-items/{name}")
            self.assertEqual(response.status_code, 404, name)


class BrandingUploadValidationTests(UploadTestCase):
    def setUp(self):
        super().setUp()
        now = timezone.now()
        self.profile = RestaurantProfile.objects.create(
            id=uuid.uuid4(),
            branch=self.branch,
            slug="audit",
            name_ar="مطعم",
            landing_page_enabled=True,
            created_at=now,
            updated_at=now,
        )

    def upload_branding(self, **files):
        return self.client.post(
            f"/api/v1/profile/{self.profile.id}/branding/", files, format="multipart"
        )

    def test_html_is_rejected_as_a_logo(self):
        self.assert_rejected(self.upload_branding(logo=a_file("logo.html", HTML, "text/html")))
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.logo)

    def test_html_is_rejected_as_a_hero_image(self):
        self.assert_rejected(
            self.upload_branding(hero_image=a_file("hero.html", HTML, "text/html"))
        )
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.hero_image)

    def test_one_bad_file_rejects_the_whole_upload(self):
        response = self.upload_branding(
            logo=a_file("logo.png", image_bytes()),
            hero_image=a_file("hero.html", HTML, "text/html"),
        )
        self.assert_rejected(response)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.logo)

    def test_a_logo_is_kept_as_png_and_bounded(self):
        response = self.upload_branding(logo=a_file("logo.png", image_bytes(size=(2000, 1000))))
        self.assertEqual(response.status_code, 200, response.data)
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.logo.name.endswith(".png"))
        self.assertEqual(stored(self.profile.logo).size, (512, 256))

    def test_a_hero_image_is_bounded(self):
        response = self.upload_branding(
            hero_image=a_file("hero.jpg", image_bytes("JPEG", size=(4000, 2000)), "image/jpeg")
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.profile.refresh_from_db()
        self.assertEqual(stored(self.profile.hero_image).size, (2000, 1000))
