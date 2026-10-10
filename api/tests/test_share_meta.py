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

from django.test import TestCase
from django.utils import timezone

from apps.profiles.models import RestaurantProfile
from tests.factories import make_branch


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
        return response.content.decode()

    def test_the_home_page_names_the_restaurant(self):
        html = self.page()
        self.assertIn("<title>مطعم &quot;وسام&quot; &lt;الشام&gt;</title>", html)
        self.assertIn('<meta name="description" content="مشاوي ومأكولات شامية"', html)
        self.assertIn('<meta property="og:title" content="مطعم &quot;وسام&quot; &lt;الشام&gt;"', html)
        self.assertIn('<meta property="og:type" content="restaurant"', html)
        self.assertIn('<link rel="canonical" href="http://orderak.example/"', html)

    def test_a_restaurant_page_by_its_address_too(self):
        html = self.page("/r/wisam/")
        self.assertIn('<link rel="canonical" href="http://orderak.example/r/wisam/"', html)
        self.assertIn("og:title", html)

    def test_structured_data_names_the_restaurant_safely(self):
        html = self.page()
        self.assertIn('<script type="application/ld+json">', html)
        self.assertIn('"@type": "Restaurant"', html)
        self.assertIn('"telephone": "0912345678"', html)
        # A name cannot close the script tag.
        self.assertNotIn("<الشام></script>", html)

    def test_an_unpublished_restaurant_is_not_described(self):
        self.profile.landing_page_enabled = False
        self.profile.save()
        self.assertNotIn("og:title", self.page())

    def test_staff_screens_stay_as_they_are(self):
        self.assertNotIn("og:title", self.page("/login/"))


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
