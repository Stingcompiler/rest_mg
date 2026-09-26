"""Applying a pushed record.

Every writer here obeys the same three rules:

- **Idempotent by client uuid.** A record whose id already exists is reported as
  a duplicate and nothing is written. Retrying a batch after a dropped
  connection is the normal case, not an error. The one exception is an order
  still *live* on the device: it is pushed once when fired to the kitchen and
  again when it closes, so it is allowed to progress.
- **Never mutate what has been synced.** A closed or void order is history.
  Corrections arrive as new records that point back at what they correct.
- **One transaction per record.** A rejected record does not roll back the rest
  of the batch, so a single bad row cannot wedge a device forever.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import MenuItem, PriceChange
from apps.orders.models import Order, OrderLine, Payment
from apps.shifts.models import CashCount, Shift
from apps.sync.serializers import RECORD_SERIALIZERS

ACCEPTED = "accepted"
DUPLICATE = "duplicate"
REJECTED = "rejected"


@dataclass(frozen=True)
class RecordResult:
    id: str
    status: str
    reason: Any = None

    def as_dict(self) -> dict:
        body = {"id": str(self.id), "status": self.status}
        if self.reason is not None:
            body["reason"] = self.reason
        return body


MODELS_BY_TYPE = {"order": Order, "shift": Shift, "price_change": PriceChange}


TERMINAL_ORDER_STATUSES = {Order.Status.CLOSED, Order.Status.VOID}


def apply_record(record: dict, device, branch=None) -> RecordResult:
    record_type, record_id = record["type"], record["id"]
    model = MODELS_BY_TYPE[record_type]

    existing = model.objects.filter(id=record_id).first()
    if existing is not None:
        # An order fired to the kitchen is pushed while still live, then pushed
        # again when it closes. So "already seen" is not automatically a
        # duplicate for orders: a *live* one may still progress, while a closed
        # or void one is history and is never touched again.
        can_progress = (
            record_type == "order" and existing.status not in TERMINAL_ORDER_STATUSES
        )
        if not can_progress:
            return RecordResult(record_id, DUPLICATE)

    serializer = RECORD_SERIALIZERS[record_type](data=record["payload"])
    if not serializer.is_valid():
        return RecordResult(record_id, REJECTED, serializer.errors)

    writer = {"order": _write_order, "shift": _write_shift, "price_change": _write_price_change}[
        record_type
    ]
    try:
        with transaction.atomic():
            writer(serializer.validated_data, device, branch, existing=existing)
    except Exception as exc:  # noqa: BLE001 - reported per record, never fatal to the batch
        return RecordResult(record_id, REJECTED, {"detail": str(exc)})

    return RecordResult(record_id, ACCEPTED)


def _timestamps(data: dict, fallback) -> dict:
    now = timezone.now()
    return {
        "created_at": data.get("created_at") or fallback or now,
        "updated_at": data.get("updated_at") or now,
        "synced_at": now,
    }


def _write_order(data: dict, device, branch=None, existing: Order | None = None) -> Order:
    lines = data.pop("lines")
    payments = data.pop("payments")
    corrects_id = data.pop("corrects_id", None)
    shift_ref = data.get("shift_ref")

    if existing is not None:
        # A live order progressing (sent → closed). Its lines and payments are
        # replaced wholesale by the device's current truth; the kitchen's own
        # `kitchen_status` is deliberately left alone, because the kitchen owns
        # that field and the tablet knows nothing about it.
        existing.lines.all().hard_delete()
        existing.payments.all().hard_delete()

    order = Order(
        id=data["id"],
        branch=branch,
        device=device,
        number=data["number"],
        type=data["type"],
        status=data["status"],
        table_id=data.get("table_id"),
        customer_id=data.get("customer_id"),
        subtotal_minor=data["subtotal_minor"],
        discount_minor=data.get("discount_minor", 0),
        total_minor=data["total_minor"],
        opened_at=data["opened_at"],
        sent_at=data.get("sent_at"),
        closed_at=data.get("closed_at"),
        cashier_id=data.get("cashier_id"),
        cashier_name=data.get("cashier_name", ""),
        shift_ref=shift_ref,
        void_reason=data.get("void_reason", ""),
        corrects_id=corrects_id if corrects_id and Order.objects.filter(id=corrects_id).exists() else None,
        **_timestamps(data, data["opened_at"]),
    )
    # The shift usually lands after its orders; link it now if it is already here,
    # otherwise the shift writer backfills.
    if shift_ref:
        order.shift = Shift.objects.filter(id=shift_ref).first()
    if existing is not None:
        # Carry the kitchen's own state across the re-save. Rebuilding the row
        # from the device payload would otherwise reset a ticket the kitchen had
        # already marked ready, because the tablet never sends this field.
        order.kitchen_status = existing.kitchen_status
        order.kitchen_updated_at = existing.kitchen_updated_at
        order.server_created_at = existing.server_created_at
    order.save()

    for line in lines:
        OrderLine.objects.create(
            id=line["id"],
            branch=order.branch,
            order=order,
            item_id=line.get("item_id"),
            name_ar=line["name_ar"],
            name_en=line.get("name_en", ""),
            unit_price_minor=line["unit_price_minor"],
            qty=line["qty"],
            modifiers_text=line.get("modifiers_text", ""),
            line_total_minor=line["line_total_minor"],
            is_void=line.get("is_void", False),
            void_reason=line.get("void_reason", ""),
            **_timestamps(line, order.opened_at),
        )

    for payment in payments:
        Payment.objects.create(
            id=payment["id"],
            branch=order.branch,
            order=order,
            method=payment["method"],
            amount_minor=payment["amount_minor"],
            tendered_minor=payment.get("tendered_minor"),
            change_minor=payment.get("change_minor", 0),
            reference=payment.get("reference", ""),
            customer_id=payment.get("customer_id"),
            taken_at=payment["taken_at"],
            **_timestamps(payment, payment["taken_at"]),
        )

    return order


def _write_shift(data: dict, device, branch=None, existing: Shift | None = None) -> Shift:
    counts = data.pop("counts")

    shift = Shift.objects.create(
        id=data["id"],
        branch=branch,
        device=device,
        name=data.get("name", ""),
        status=data["status"],
        cashier_id=data.get("cashier_id"),
        cashier_name=data.get("cashier_name", ""),
        opened_at=data["opened_at"],
        closed_at=data.get("closed_at"),
        opening_float_minor=data.get("opening_float_minor", 0),
        expected_cash_minor=data["expected_cash_minor"],
        counted_cash_minor=data["counted_cash_minor"],
        variance_minor=data["variance_minor"],
        variance_reason=data.get("variance_reason", ""),
        **_timestamps(data, data["opened_at"]),
    )

    for row in counts:
        CashCount.objects.create(
            id=row["id"],
            branch=shift.branch,
            shift=shift,
            denomination_minor=row.get("denomination_minor"),
            label=row.get("label", ""),
            count=row.get("count", 0),
            line_total_minor=row["line_total_minor"],
            **_timestamps(row, shift.opened_at),
        )

    # Backfill orders that named this shift before it existed.
    Order.objects.filter(shift_ref=shift.id, shift__isnull=True).update(shift=shift)
    return shift


def _write_price_change(data: dict, device, branch=None, existing: PriceChange | None = None) -> PriceChange:
    item = MenuItem.objects.get(id=data["item_id"])

    change = PriceChange.objects.create(
        id=data["id"],
        branch=item.branch,
        item=item,
        old_price_minor=data["old_price_minor"],
        new_price_minor=data["new_price_minor"],
        reason=data.get("reason", PriceChange.Reason.MANUAL),
        percent=data.get("percent"),
        source_device=device,
        applied_at=data["applied_at"],
        **_timestamps(data, data["applied_at"]),
    )

    # Last writer wins: a stale edit is recorded but does not move the price back.
    if item.updated_at is None or change.applied_at >= item.updated_at:
        item.price_minor = change.new_price_minor
        item.updated_at = change.applied_at
        item.save(update_fields=["price_minor", "updated_at", "server_updated_at"])

    return change
