"""A shared link and a search engine see the restaurant (batch 47).

Review of 10 October, F13: the page's HTML said only «اوردراك»; the
restaurant's name arrived later from the API, so a link shared on WhatsApp
previewed as the product, not the restaurant, with no description, Open
Graph, canonical address or structured data; robots.txt and sitemap.xml were
404. The server now writes the published restaurant into the HTML it serves,
and answers robots.txt and sitemap.xml.
"""
from __future__ import annotations

import uuid

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.profiles.models import RestaurantProfile
from tests.factories import make_branch


@override_settings(ALLOWED_HOSTS=["orderak.example"])
class ShareMetaTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.profile = RestaurantProfile.objects.create(
            id=uuid.uuid4(), branch=make_branch(), slug="wisam", name_ar='مطعم "وسام" <الشام>',
            description_ar="مشاوي ومأكولات شامية", phone="0912345678", address_ar="الخرطوم ٢",
            landing_page_enabled=True, created_at=now, updated_at=now,
        )

    def page(self, path="/"):
        response = self.client.get(path, HTTP_HOST="orderak.example")
        self.assertEqual(response.status_code, 200)
        body = b"".join(response.streaming_content) if response.streaming else response.content
        return body.decode()

    def test_the_home_page_is_orderak_not_one_restaurant(self):
        """The root is Orderak's own page for buyers (batch 68); a restaurant is at /r/<slug>/."""
        html = self.page()
        self.assertNotIn('content="restaurant"', html)
        self.assertNotIn("وسام", html)
        self.assertNotIn('"@type": "Restaurant"', html)

    def test_a_restaurant_page_names_the_restaurant(self):
        html = self.page("/r/wisam/")
        self.assertIn("<title>مطعم &quot;وسام&quot; &lt;الشام&gt;</title>", html)
        self.assertIn('<meta name="description" content="مشاوي ومأكولات شامية"', html)
        self.assertIn('<meta property="og:title" content="مطعم &quot;وسام&quot; &lt;الشام&gt;"', html)
        self.assertIn('<meta property="og:type" content="restaurant"', html)
        self.assertIn('<link rel="canonical" href="http://orderak.example/r/wisam/"', html)

    def test_structured_data_names_the_restaurant_safely(self):
        html = self.page("/r/wisam/")
        self.assertIn('<script type="application/ld+json">', html)
        self.assertIn('"@type": "Restaurant"', html)
        self.assertIn('"telephone": "0912345678"', html)
        # A name cannot close the script tag.
        self.assertNotIn("<الشام></script>", html)

    def test_an_unpublished_restaurant_is_not_described(self):
        self.profile.landing_page_enabled = False
        self.profile.save()
        self.assertNotIn("og:title", self.page("/r/wisam/"))

    def test_the_old_product_address_leads_to_the_home_page(self):
        response = self.client.get("/orderak/", HTTP_HOST="orderak.example")
        self.assertEqual(response.status_code, 301)
        self.assertEqual(response["Location"], "/")
        # Its pictures are still served from there.
        self.assertNotEqual(self.client.get("/orderak/till.webp", HTTP_HOST="orderak.example").status_code, 301)

    def test_staff_screens_stay_as_they_are(self):
        self.assertNotIn("og:title", self.page("/login/"))


@override_settings(ALLOWED_HOSTS=["orderak.example"])
class RobotsAndSitemapTests(TestCase):
    def setUp(self):
        now = timezone.now()
        RestaurantProfile.objects.create(
            id=uuid.uuid4(), branch=make_branch(), slug="wisam", name_ar="وسام",
            landing_page_enabled=True, created_at=now, updated_at=now,
        )

    def test_robots_keeps_the_staff_screens_out_and_points_to_the_sitemap(self):
        response = self.client.get("/robots.txt", HTTP_HOST="orderak.example")
        self.assertEqual(response.status_code, 200)
        body = response.content.decode()
        for path in ("/pos/", "/manager/", "/kitchen/", "/catalog/", "/deliveries/", "/login/", "/api/"):
            self.assertIn(f"Disallow: {path}", body)
        self.assertIn("Sitemap: http://orderak.example/sitemap.xml", body)

    def test_the_sitemap_lists_the_public_pages(self):
        response = self.client.get("/sitemap.xml", HTTP_HOST="orderak.example")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/xml", response["Content-Type"])
        body = response.content.decode()
        self.assertIn("<loc>http://orderak.example/</loc>", body)
        self.assertIn("<loc>http://orderak.example/r/wisam/</loc>", body)

    def test_the_sitemap_lists_the_home_page_once_and_not_the_old_product_address(self):
        """Orderak's own page is the home page (batch 68); /orderak/ only redirects to it."""
        sitemap = self.client.get("/sitemap.xml", HTTP_HOST="orderak.example").content.decode()
        self.assertEqual(sitemap.count("<loc>http://orderak.example/</loc>"), 1)
        self.assertNotIn("/orderak/", sitemap)
