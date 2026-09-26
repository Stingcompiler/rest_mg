"""Customers, and the money they owe.

Credit (آجل / ذمم) was already recorded on the bill — a payment of method
`credit` carries the id of whoever owes it — but there was nobody to point at.
This is that somebody, plus the other half of the story: what has been paid back.

Two rules shape the design:

- **A customer is never deleted.** A person who stops coming still owes what they
  owed, and old bills must stay attributable. They are deactivated instead.
- **A settlement is a record, not an edit.** Repayment does not reach back and
  alter the sale; it is its own row, and the balance is the difference. The
  sale's history stays exactly as it happened.
"""
from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class Customer(BaseModel):
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=32, blank=True)
    note = models.CharField(max_length=240, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["branch", "is_active"])]

    def __str__(self) -> str:
        return self.name

    def retire(self) -> None:
        """No hard deletes: a customer who stops coming goes inactive, so the
        debts and bills that name them stay readable."""
        self.is_active = False
        self.save(update_fields=["is_active", "updated_at", "server_updated_at"])


class CustomerSettlement(BaseModel):
    """A repayment against what a customer owes.

    Deliberately not a `Payment`: a Payment belongs to an order and settles *that
    bill*. This settles an account, and may cover several bills at once or part
    of one. Keeping them apart is what lets the sale stay immutable while the
    balance still moves.
    """

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        BANK = "bank", "Bank transfer"
        WALLET = "wallet", "E-wallet"

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="settlements")
    amount_minor = models.BigIntegerField()
    method = models.CharField(max_length=16, choices=Method.choices, default=Method.CASH)
    reference = models.CharField(max_length=80, blank=True)
    note = models.CharField(max_length=240, blank=True)
    taken_at = models.DateTimeField()
    # Who took the money, as a name snapshot — the same approach the orders use,
    # so the record still reads correctly after an account is renamed or closed.
    received_by_name = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["-taken_at"]

    def __str__(self) -> str:
        return f"{self.customer.name}: {self.amount_minor}"
