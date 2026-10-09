"""A screen's data file loaded as a page goes to the screen (batch 41).

The owner, after an automatic deploy, landed on orderak.stingdev.pro/catalog/
index.txt: a page of raw router data. Moving between screens makes the Next.js
router fetch the next screen's payload (`/catalog/index.txt?_rsc=…`); when it
cannot use it — the tab still runs the build before the deploy — it falls back
to loading that address as a whole page. The till's offline worker sends such
a load to the screen (batch 33), but only under /pos/, and only offline. With
deploys on every merge it happens on every screen.

The server now answers a page load of a payload with a redirect to its screen,
and still hands the payload to the router itself.
"""
from __future__ import annotations

from django.test import TestCase


class PayloadPageLoadTests(TestCase):
    def test_a_page_load_of_a_payload_goes_to_its_screen(self):
        response = self.client.get("/catalog/index.txt", HTTP_SEC_FETCH_DEST="document", HTTP_ACCEPT="text/html")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/catalog/")

    def test_nested_screens_and_the_router_query_too(self):
        response = self.client.get("/manager/staff/index.txt?_rsc=abc12", HTTP_SEC_FETCH_DEST="document")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/manager/staff/")

    def test_the_home_payload_goes_home(self):
        response = self.client.get("/index.txt", HTTP_SEC_FETCH_DEST="document")
        self.assertEqual(response["Location"], "/")

    def test_a_browser_without_fetch_metadata_is_read_by_what_it_accepts(self):
        response = self.client.get("/catalog/index.txt", HTTP_ACCEPT="text/html,application/xhtml+xml")
        self.assertEqual(response.status_code, 302)

    def test_the_router_still_gets_the_payload(self):
        response = self.client.get("/catalog/index.txt?_rsc=abc12", HTTP_RSC="1", HTTP_SEC_FETCH_DEST="empty")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Location", response)

    def test_a_plain_fetch_still_gets_the_payload(self):
        # The till's worker precaches payloads with fetch() (batch 33).
        response = self.client.get("/pos/payment/index.txt", HTTP_SEC_FETCH_DEST="empty", HTTP_ACCEPT="*/*")
        self.assertEqual(response.status_code, 200)

    def test_other_text_files_are_left_alone(self):
        response = self.client.get("/robots.txt", HTTP_SEC_FETCH_DEST="document")
        self.assertNotEqual(response.status_code, 302)
