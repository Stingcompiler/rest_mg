/**
 * The activity log in words, not codes.
 *
 * A cancelled delivery read "حالة التوصيل: pending → cancelled", and the
 * reason it was cancelled for was not shown at all (batch 12).
 */
import { describe, expect, it } from 'vitest';

import { auditValueKey } from '../auditValues';

describe('auditValueKey', () => {
  it('names delivery and kitchen statuses', () => {
    expect(auditValueKey('delivery_status', 'pending')).toBe('deliveries.status.pending');
    expect(auditValueKey('delivery_status', 'out_for_delivery')).toBe('deliveries.status.outForDelivery');
    expect(auditValueKey('kitchen_status', 'ready')).toBe('kitchen.ready');
  });

  it('names roles', () => {
    expect(auditValueKey('role', 'cashier')).toBe('role.cashier');
  });

  it('leaves values it does not know as they are', () => {
    expect(auditValueKey('delivery_status', 'teleported')).toBeNull();
    expect(auditValueKey('display_name', 'سمية')).toBeNull();
  });
});
