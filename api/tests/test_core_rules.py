"""The invariants every model in the project is built on."""
from __future__ import annotations

import uuid

from django.test import TestCase
from django.utils import timezone

from apps.catalog.models import Category, MenuItem
from apps.core.models import HardDeleteBlocked
from tests.factories import make_branch, make_category, make_item


class ClientGeneratedIdentityTests(TestCase):
    def test_saving_without_an_id_is_refused(self):
        now = timezone.now()
        category = Category(name_ar="مشاوي", created_at=now, updated_at=now)
        with self.assertRaises(ValueError) as caught:
            category.save()
        self.assertIn("client-generated UUID", str(caught.exception))

    def test_the_client_id_is_kept_verbatim(self):
        chosen = uuid.uuid4()
        category = make_category(id=chosen)
        self.assertEqual(category.id, chosen)


class NoHardDeleteTests(TestCase):
    def test_instance_delete_raises(self):
        item = make_item()
        with self.assertRaises(HardDeleteBlocked):
            item.delete()

    def test_queryset_delete_raises(self):
        make_item()
        with self.assertRaises(HardDeleteBlocked):
            MenuItem.objects.all().delete()

    def test_branch_delete_raises(self):
        branch = make_branch()
        with self.assertRaises(HardDeleteBlocked):
            branch.delete()

    def test_retire_is_the_supported_path(self):
        item = make_item()
        item.retire()
        item.refresh_from_db()
        self.assertFalse(item.is_active)
        self.assertTrue(MenuItem.objects.filter(id=item.id).exists())


class TwoClocksTests(TestCase):
    def test_device_clock_is_preserved_and_server_clock_is_its_own(self):
        stale = timezone.now() - timezone.timedelta(days=3)
        item = make_item()
        item.updated_at = stale
        item.save()
        item.refresh_from_db()

        self.assertEqual(item.updated_at, stale)
        # The server clock ignores the device's claim — it is the pull cursor.
        self.assertGreater(item.server_updated_at, stale)


class BigMoneyTests(TestCase):
    def test_amounts_beyond_double_precision_survive(self):
        # 2**53 + 1 is the first integer a JSON number cannot represent exactly.
        huge = 2**53 + 1
        item = make_item(price_minor=huge)
        item.refresh_from_db()
        self.assertEqual(item.price_minor, huge)
