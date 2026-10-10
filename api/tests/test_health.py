"""/healthz says whether the system can serve, not only that Python runs (batch 45).

Review of 10 October, F10: /healthz answered "ok" without touching the
database or the built frontend, and it is what the deploy's rollback and the
five-minute Telegram check both trust. A release with a dead database
connection or a missing web/out would have passed as healthy.
"""
from __future__ import annotations

from pathlib import Path
from unittest import mock

from django.db.utils import OperationalError
from django.test import TestCase, override_settings


class HealthTests(TestCase):
    def test_ok_when_the_database_and_the_frontend_answer(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "database": "ok", "frontend": "ok"})

    def test_unavailable_when_the_database_does_not_answer(self):
        with mock.patch("config.urls.connection.cursor", side_effect=OperationalError("down")):
            response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["status"], "unavailable")
        self.assertEqual(response.json()["database"], "unavailable")

    @override_settings(FRONTEND_DIR=Path("/nonexistent/web/out"))
    def test_unavailable_when_the_frontend_is_not_built(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["frontend"], "unavailable")

    def test_says_nothing_about_why_beyond_which_part(self):
        with mock.patch("config.urls.connection.cursor", side_effect=OperationalError("password authentication failed for user x")):
            body = self.client.get("/healthz").content.decode()
        self.assertNotIn("password", body)
