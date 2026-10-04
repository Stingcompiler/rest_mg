"""Opening hours the manager can edit, with real days (batch 23).

The hours were free text that only the seed could write: no screen edited
them, and "السبت – الخميس" could not tell the page whether the restaurant is
open now. A row now carries ``days`` (0 = Sunday … 6 = Saturday, as a
browser's ``getDay``) and times as HH:MM, and the server refuses a row it
could not read. Rows saved before this, with no ``days``, still load and
still show; they just cannot say "open now".
"""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.profiles.models import RestaurantProfile
from tests.factories import make_branch, make_manager


class OpeningHoursTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.client = APIClient()
        self.client.force_authenticate(make_manager(branch=self.branch))
        now = timezone.now()
        self.profile = RestaurantProfile.objects.create(
            id=uuid.uuid4(),
            branch=self.branch,
            slug="mataam",
            name_ar="مطعم",
            landing_page_enabled=True,
            created_at=now,
            updated_at=now,
        )

    def save(self, hours):
        return self.client.put(
            f"/api/v1/profile/{self.profile.id}/",
            {"id": str(self.profile.id), "slug": "mataam", "name_ar": "مطعم",
             "landing_page_enabled": True, "hours": hours},
            format="json",
        )

    def test_rows_with_days_and_times_are_saved_and_published(self):
        hours = [
            {"days": [6, 0, 1, 2, 3, 4], "open": "08:00", "close": "23:00",
             "day_ar": "السبت – الخميس", "day_en": "Sat – Thu"},
            {"days": [5], "open": "13:00", "close": "23:00", "day_ar": "الجمعة", "day_en": "Friday"},
        ]
        response = self.save(hours)
        self.assertEqual(response.status_code, 200, response.content)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.hours, hours)
        page = APIClient().get("/api/v1/public/mataam/").json()
        self.assertEqual(page["hours"][1]["days"], [5])

    def test_a_late_night_row_may_close_after_midnight(self):
        response = self.save([{"days": [4], "open": "18:00", "close": "02:00"}])
        self.assertEqual(response.status_code, 200, response.content)

    def test_a_split_day_is_two_rows_on_the_same_day(self):
        response = self.save([
            {"days": [5], "open": "07:00", "close": "11:00"},
            {"days": [5], "open": "16:00", "close": "23:00"},
        ])
        self.assertEqual(response.status_code, 200, response.content)

    def test_rows_saved_before_days_existed_still_load(self):
        response = self.save([{"day_ar": "يوميًا", "open": "08:00", "close": "23:00"}])
        self.assertEqual(response.status_code, 200, response.content)

    def test_a_row_the_page_could_not_read_is_refused(self):
        for bad in (
            {"days": [], "open": "08:00", "close": "23:00"},           # no day
            {"days": [7], "open": "08:00", "close": "23:00"},          # no such day
            {"days": [1, 1], "open": "08:00", "close": "23:00"},       # the same day twice
            {"days": ["1"], "open": "08:00", "close": "23:00"},        # not a number
            {"days": [1], "open": "25:00", "close": "23:00"},          # no such time
            {"days": [1], "open": "8:00", "close": "23:00"},           # not HH:MM
            {"days": [1], "close": "23:00"},                           # no opening time
            {"days": [1], "open": "08:00", "close": "23:00", "note": "x"},  # unknown field
        ):
            with self.subTest(row=bad):
                self.assertEqual(self.save([bad]).status_code, 400)

    def test_no_more_than_a_row_per_day_and_a_split_for_each(self):
        self.assertEqual(self.save([{"days": [1], "open": "08:00", "close": "09:00"}] * 15).status_code, 400)
