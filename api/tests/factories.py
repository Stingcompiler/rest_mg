"""Test fixtures. Everything is created the way a device would create it:
client-generated UUIDs, explicit timestamps, money as integers in minor units.
"""
from __future__ import annotations

import uuid

from django.utils import timezone

from apps.accounts.models import Device, ManagerUser
from apps.catalog.models import Category, MenuItem
from apps.core.models import Branch


def make_branch(**kwargs) -> Branch:
    return Branch.objects.create(name_ar=kwargs.pop("name_ar", "فرع الخرطوم ٢"), **kwargs)


def make_manager(branch=None, **kwargs) -> ManagerUser:
    return ManagerUser.objects.create_user(
        username=kwargs.pop("username", "manager"),
        password=kwargs.pop("password", "correct-horse-battery"),
        role=kwargs.pop("role", ManagerUser.Role.MANAGER),
        branch=branch,
        **kwargs,
    )


def make_device(branch=None) -> tuple[Device, str]:
    branch = branch or make_branch()
    return Device.enrol(label="تابلت الكاشير", branch=branch)


def make_category(branch=None, **kwargs) -> Category:
    now = timezone.now()
    return Category.objects.create(
        id=kwargs.pop("id", uuid.uuid4()),
        branch=branch,
        name_ar=kwargs.pop("name_ar", "مشاوي"),
        created_at=now,
        updated_at=now,
        **kwargs,
    )


def make_item(category=None, branch=None, price_minor: int = 12_500, **kwargs) -> MenuItem:
    now = timezone.now()
    category = category or make_category(branch=branch)
    return MenuItem.objects.create(
        id=kwargs.pop("id", uuid.uuid4()),
        branch=branch,
        category=category,
        name_ar=kwargs.pop("name_ar", "شاورما لحم"),
        price_minor=price_minor,
        created_at=now,
        updated_at=now,
        **kwargs,
    )


def order_payload(
    *,
    order_id=None,
    total: int = 25_000,
    payments=None,
    status: str = "closed",
    shift_ref=None,
    discount: int = 0,
) -> dict:
    """A closed order exactly as the tablet would push it."""
    order_id = order_id or uuid.uuid4()
    now = timezone.now()
    subtotal = total + discount
    payments = (
        payments
        if payments is not None
        else [
            {
                "id": str(uuid.uuid4()),
                "method": "cash",
                "amount_minor": str(total),
                "tendered_minor": str(total),
                "change_minor": "0",
                "taken_at": now.isoformat(),
            }
        ]
    )
    return {
        "id": str(order_id),
        "number": "1048",
        "type": "dine_in",
        "status": status,
        "subtotal_minor": str(subtotal),
        "discount_minor": str(discount),
        "total_minor": str(total),
        "opened_at": now.isoformat(),
        "closed_at": now.isoformat(),
        "cashier_name": "سمية",
        "shift_ref": str(shift_ref) if shift_ref else None,
        "lines": [
            {
                "id": str(uuid.uuid4()),
                "name_ar": "شاورما لحم",
                "unit_price_minor": str(subtotal),
                "qty": 1,
                "line_total_minor": str(subtotal),
            }
        ],
        "payments": payments,
    }


def shift_payload(*, shift_id=None, expected: int = 25_000, counted: int = 25_000, reason: str = "") -> dict:
    shift_id = shift_id or uuid.uuid4()
    now = timezone.now()
    return {
        "id": str(shift_id),
        "name": "الصباحية",
        "status": "closed",
        "cashier_name": "سمية",
        "opened_at": now.isoformat(),
        "closed_at": now.isoformat(),
        "opening_float_minor": "0",
        "expected_cash_minor": str(expected),
        "counted_cash_minor": str(counted),
        "variance_minor": str(counted - expected),
        "variance_reason": reason,
        "counts": [
            {
                "id": str(uuid.uuid4()),
                "denomination_minor": "5000",
                "label": "٥٠٠٠",
                "count": counted // 5000,
                "line_total_minor": str((counted // 5000) * 5000),
            },
            {
                "id": str(uuid.uuid4()),
                "label": "معدن",
                "count": 0,
                "line_total_minor": str(counted - (counted // 5000) * 5000),
            },
        ],
    }


def envelope(*records) -> dict:
    return {"batch_id": str(uuid.uuid4()), "records": list(records)}


def record(record_type: str, payload: dict) -> dict:
    return {"type": record_type, "id": payload["id"], "payload": payload}
