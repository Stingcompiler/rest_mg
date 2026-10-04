/**
 * Which field of the order form is wrong, in the order the form shows them
 * (batch 14). One sentence used to cover every field, and nothing moved the
 * customer to the one to fix.
 */
import type { MessageKey } from '@/i18n';
import { normalizeSudanPhone } from '@/lib/phone';

export type OrderField = 'name' | 'phone' | 'address';

export interface FieldProblem {
  field: OrderField;
  key: MessageKey;
}

export type Fulfilment = 'delivery' | 'pickup';

/** A pickup needs no address (batch 16). */
export function validateOrderForm(
  values: { name: string; phone: string; address: string },
  fulfilment: Fulfilment = 'delivery',
): FieldProblem[] {
  const problems: FieldProblem[] = [];
  if (!values.name.trim()) problems.push({ field: 'name', key: 'landing.form.nameRequired' });
  if (!values.phone.trim()) problems.push({ field: 'phone', key: 'landing.form.phoneRequired' });
  else if (!normalizeSudanPhone(values.phone)) problems.push({ field: 'phone', key: 'landing.form.phoneInvalid' });
  if (fulfilment === 'delivery' && !values.address.trim()) {
    problems.push({ field: 'address', key: 'landing.form.addressRequired' });
  }
  return problems;
}
