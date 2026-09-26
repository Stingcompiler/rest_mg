"""Serving the exported frontend: dev-only routes, and path-traversal safety.

The monolith hands out `web/out` itself, so the rules about *what* it will hand
out belong here rather than in a reverse proxy that this deployment does not have.
"""
from __future__ import annotations

from django.test import TestCase, override_settings

from config.spa import _is_dev_only


class DevOnlyRouteTests(TestCase):
    def test_gallery_is_recognised_as_dev_only(self):
        for path in ["gallery", "gallery/", "/gallery/", "gallery/buttons"]:
            self.assertTrue(_is_dev_only(path), path)

    def test_product_routes_are_not_dev_only(self):
        for path in ["", "pos", "manager/staff", "kitchen", "catalog", "deliveries", "r/mataam"]:
            self.assertFalse(_is_dev_only(path), path)

    def test_a_route_merely_starting_with_the_word_is_not_matched(self):
        # Prefix matching is per path segment, not per character: a real route
        # named "gallery-of-fame" must not be swept up by the dev-only rule.
        self.assertFalse(_is_dev_only("gallery-of-fame"))

    @override_settings(DEBUG=False)
    def test_gallery_is_not_served_in_production(self):
        response = self.client.get("/gallery/")
        self.assertEqual(response.status_code, 404)

    # There is deliberately no "…is served in development" test here. Whether the
    # bench exists at all is a *build* concern, not a serving one: `next.config.mjs`
    # only counts `page.dev.tsx` as a route while developing, so a production
    # export contains no /gallery to serve and this layer would 404 it either way.
    # These two layers are independent on purpose — the build stops it shipping,
    # this guard stops a stale export serving it — and each is checked where it
    # lives (the build by inspecting the export, this by the test above).


class PathTraversalTests(TestCase):
    @override_settings(DEBUG=False)
    def test_traversal_out_of_the_export_is_refused(self):
        for attempt in ["../settings.py", "../../etc/passwd", "..%2f..%2fsecrets"]:
            response = self.client.get(f"/{attempt}")
            self.assertIn(response.status_code, (404, 503), attempt)
