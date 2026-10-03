"""Batch 11 on the server: a customer's phone, and why an order was cancelled.

From the user-experience review:
- The public order accepted any non-empty phone. Every website order is
  confirmed by phone before the kitchen sees it (decision D1), so "123" made an
  order nobody could confirm. The number is now checked and stored in one form.
- A delivery order could be cancelled with no reason. The void reason was
  always "Delivery cancelled", so the activity log could not say why a
  customer's order was dropped.
"""
from __future__ import annotations

from apps.accounts.models import ManagerUser
from apps.audit.models import AuditLog
from apps.orders.models import Order
from tests.test_delivery_status import DeliveryStatusTestCase


class PublicOrderPhoneTests(DeliveryStatusTestCase):
    def order_with_phone(self, phone):
        body = {
            "customer_name": "أحمد", "customer_phone": phone,
            "customer_address": "شارع النيل",
            "items": [{"item_id": str(self.item.id), "qty": 1}],
        }
        return self.public.post("/api/v1/public/order/", body, format="json")

    def test_a_number_nobody_can_call_is_refused(self):
        for phone in ["123", "09123", "0812345678", "091234567890", "abc"]:
            r = self.order_with_phone(phone)
            self.assertEqual(r.status_code, 400, phone)
            self.assertEqual(r.data["error"]["code"], "invalid_phone", phone)
        self.assertFalse(Order.objects.exists())

    def test_a_sudanese_number_is_stored_in_one_form(self):
        for phone in ["0912 345 678", "+249912345678", "00249912345678", "٠٩١٢٣٤٥٦٧٨"]:
            r = self.order_with_phone(phone)
            self.assertEqual(r.status_code, 201, phone)
            self.assertEqual(Order.objects.get(id=r.data["id"]).customer_phone, "0912345678", phone)


class CancelReasonTests(DeliveryStatusTestCase):
    def cancel(self, client, oid, reason=None):
        body = {"delivery_status": "cancelled"}
        if reason is not None:
            body["reason"] = reason
        return client.post(f"/api/v1/orders/{oid}/delivery-status/", body, format="json")

    def test_cancelling_needs_a_reason(self):
        oid = self.place_order()
        m = self.as_role("m.reason", ManagerUser.Role.MANAGER)
        for reason in [None, "", "   "]:
            r = self.cancel(m, oid, reason)
            self.assertEqual(r.status_code, 400, repr(reason))
            self.assertEqual(r.data["error"]["code"], "reason_required")
        self.assertEqual(Order.objects.get(id=oid).delivery_status, "pending")

    def test_the_reason_is_kept_on_the_order_and_in_the_log(self):
        oid = self.place_order()
        m = self.as_role("m.reason2", ManagerUser.Role.MANAGER)
        r = self.cancel(m, oid, "الزبون لم يرد على الهاتف")
        self.assertEqual(r.status_code, 200)
        order = Order.objects.get(id=oid)
        self.assertEqual(order.status, Order.Status.VOID)
        self.assertEqual(order.void_reason, "الزبون لم يرد على الهاتف")
        entry = AuditLog.objects.filter(action=AuditLog.Action.DELIVERY_STATUS).latest("created_at")
        self.assertEqual(entry.metadata.get("reason"), "الزبون لم يرد على الهاتف")

    def test_other_steps_need_no_reason(self):
        oid = self.place_order()
        m = self.as_role("m.reason3", ManagerUser.Role.MANAGER)
        r = m.post(f"/api/v1/orders/{oid}/delivery-status/", {"delivery_status": "confirmed"}, format="json")
        self.assertEqual(r.status_code, 200)
