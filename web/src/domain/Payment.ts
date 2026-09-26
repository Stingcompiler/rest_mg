/**
 * A payment against an order.
 *
 * Two rules live here and matter everywhere downstream:
 *   - a bank transfer or wallet payment must carry a reference; a credit payment
 *     must name the customer who owes it;
 *   - only cash counts toward the drawer. Credit (آجل / ذمم) settles the balance
 *     but is never expected cash and never revenue.
 *
 * Over-tender is a property of the payment: `changeMinor` is what goes back to
 * the customer, so the order's amount due can floor at zero and never go
 * negative.
 */
import { assert } from './errors';
import { newId } from './ids';
import { maxMoney, type Money } from './money';
import type { PaymentMethod } from './types';

export interface PaymentSnapshot {
  id: string;
  method: PaymentMethod;
  amountMinor: Money;
  tenderedMinor: Money | null;
  changeMinor: Money;
  reference: string;
  customerId: string | null;
  takenAt: string;
}

export interface NewPaymentInput {
  id?: string;
  method: PaymentMethod;
  amountMinor: Money;
  tenderedMinor?: Money | null;
  reference?: string;
  customerId?: string | null;
  takenAt?: string;
}

export class Payment {
  private constructor(private state: PaymentSnapshot) {}

  static create(input: NewPaymentInput): Payment {
    assert(input.amountMinor > 0n, 'payment_invalid', 'A payment must be for a positive amount.');

    const tendered = input.tenderedMinor ?? null;
    // Change is only meaningful for cash over-tender; it is derived, never typed.
    const change = tendered !== null ? maxMoney(tendered - input.amountMinor, 0n) : 0n;

    const payment = new Payment({
      id: input.id ?? newId(),
      method: input.method,
      amountMinor: input.amountMinor,
      tenderedMinor: tendered,
      changeMinor: change,
      reference: input.reference ?? '',
      customerId: input.customerId ?? null,
      takenAt: input.takenAt ?? new Date().toISOString(),
    });
    payment.assertValid();
    return payment;
  }

  static fromSnapshot(snapshot: PaymentSnapshot): Payment {
    return new Payment({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get method(): PaymentMethod {
    return this.state.method;
  }

  get amountMinor(): Money {
    return this.state.amountMinor;
  }

  get changeMinor(): Money {
    return this.state.changeMinor;
  }

  requiresReference(): boolean {
    return this.state.method === 'bank' || this.state.method === 'wallet';
  }

  isCash(): boolean {
    return this.state.method === 'cash';
  }

  /** Cash is the only method that lands in the drawer. */
  countsTowardExpectedCash(): boolean {
    return this.state.method === 'cash';
  }

  isValid(): boolean {
    if (this.state.amountMinor <= 0n) return false;
    if (this.requiresReference() && this.state.reference.trim() === '') return false;
    if (this.state.method === 'credit' && !this.state.customerId) return false;
    return true;
  }

  private assertValid(): void {
    assert(
      !this.requiresReference() || this.state.reference.trim() !== '',
      'payment_reference_required',
      `A ${this.state.method} payment must carry a reference.`,
    );
    assert(
      this.state.method !== 'credit' || Boolean(this.state.customerId),
      'payment_customer_required',
      'A credit payment must name the customer who owes it.',
    );
  }

  toSnapshot(): PaymentSnapshot {
    return { ...this.state };
  }
}
