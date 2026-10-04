"""Seed a branch, a manager, a device and the menu from the design mockups.

    python manage.py seed --password <manager password>

Idempotent: running it twice changes nothing. Intended for development and for
first-run provisioning, not for tests.
"""
from __future__ import annotations

import uuid

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import Device, ManagerUser
from apps.catalog.models import Category, MenuItem
from apps.core.models import Branch
from apps.profiles.models import RestaurantProfile

MENU = {
    "مشاوي": [
        ("شاورما لحم", "Beef shawarma", 12_500, "خبز طازج وسلطة"),
        ("شاورما دجاج", "Chicken shawarma", 10_000, "عادي · حار"),
        ("كبدة إسكندراني", "Alexandrian liver", 15_000, "حارة أو عادية"),
        ("كباب لحم", "Beef kebab", 22_000, "مع أرز أو خبز"),
        ("دجاج مشوي نصف", "Half grilled chicken", 18_000, "على الفحم"),
        ("سمك مقلي", "Fried fish", 25_000, ""),
    ],
    "وجبات": [
        ("أرز باللحم", "Rice with lamb", 20_000, "طبق كامل"),
        ("فول بالزيت", "Ful with oil", 6_000, "بالزيت أو بالجبنة"),
        ("طعمية", "Taamiya", 4_500, "٥ حبات"),
        ("سلطة خضراء", "Green salad", 5_000, ""),
    ],
    "مشروبات": [
        ("عصير مانجو", "Mango juice", 8_000, "طازج"),
        ("شاي", "Tea", 2_000, "بالحليب أو سادة"),
    ],
}


class Command(BaseCommand):
    help = "Create a development branch, manager, device and menu."

    def add_arguments(self, parser):
        parser.add_argument("--username", default="manager")
        parser.add_argument("--password", default="change-me-please")
        parser.add_argument("--branch", default="فرع الخرطوم ٢")

    def handle(self, *args, **options):
        now = timezone.now()

        branch, created = Branch.objects.get_or_create(
            name_ar=options["branch"], defaults={"name_en": "Khartoum 2"}
        )
        # Keep console output ASCII: a Windows terminal may be cp1252 and cannot
        # encode the Arabic names, which would crash the command mid-seed.
        self.stdout.write(f"{'created' if created else 'found'} branch {branch.name_en or branch.id}")

        if not ManagerUser.objects.filter(username=options["username"]).exists():
            ManagerUser.objects.create_user(
                username=options["username"],
                password=options["password"],
                role=ManagerUser.Role.OWNER,
                display_name="المدير",
                branch=branch,
                is_staff=True,
                is_superuser=True,
            )
            self.stdout.write(f"created manager {options['username']}")

        # The floor staff: a cashier per shift, and the kitchen screen. Each gets
        # their own account, so a shift and every order it takes are attributed
        # to the person who actually worked them.
        staff = [
            ("cashier.day", ManagerUser.Role.CASHIER, "سمية"),
            ("cashier.night", ManagerUser.Role.CASHIER, "عمر"),
            ("kitchen", ManagerUser.Role.KITCHEN, "المطبخ"),
        ]
        for username, role, display_name in staff:
            if ManagerUser.objects.filter(username=username).exists():
                continue
            ManagerUser.objects.create_user(
                username=username,
                password=options["password"],
                role=role,
                display_name=display_name,
                branch=branch,
            )
            self.stdout.write(f"created {role} {username}")

        for sort, (category_name, items) in enumerate(MENU.items()):
            category, _ = Category.objects.get_or_create(
                name_ar=category_name,
                branch=branch,
                defaults={
                    "id": uuid.uuid4(),
                    "sort": sort,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            for item_sort, (name_ar, name_en, price, description) in enumerate(items):
                MenuItem.objects.get_or_create(
                    name_ar=name_ar,
                    category=category,
                    defaults={
                        "id": uuid.uuid4(),
                        "branch": branch,
                        "name_en": name_en,
                        "description_ar": description,
                        "price_minor": price,
                        "sort": item_sort,
                        "created_at": now,
                        "updated_at": now,
                    },
                )

        RestaurantProfile.objects.get_or_create(
            slug="wisam-al-sham",
            defaults={
                "id": uuid.uuid4(),
                "branch": branch,
                "name_ar": "مطعم وسام الشام",
                "name_en": "Wisam Al-Sham",
                "description_ar": "مشاوي ومأكولات شامية وسودانية",
                "address_ar": "الخرطوم ٢، شارع النيل، مقابل الصيدلية",
                "phone": "0912345678",
                "whatsapp": "0912345678",
                "hours": [
                    # days: 0 = Sunday … 6 = Saturday (batch 23).
                    {"days": [6, 0, 1, 2, 3, 4], "day_ar": "السبت – الخميس", "day_en": "Saturday – Thursday",
                     "open": "08:00", "close": "23:00"},
                    {"days": [5], "day_ar": "الجمعة", "day_en": "Friday", "open": "13:00", "close": "23:00"},
                ],
                # Published by default in dev so the public landing page is
                # viewable immediately after seeding.
                "landing_page_enabled": True,
                "prices_updated_at": now,
                "created_at": now,
                "updated_at": now,
            },
        )

        if not Device.objects.filter(branch=branch).exists():
            _, token = Device.enrol(label="تابلت الكاشير", branch=branch)
            self.stdout.write(self.style.WARNING(f"device token (shown once): {token}"))

        self.stdout.write(self.style.SUCCESS("seed complete"))
