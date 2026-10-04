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

  it('names the pickup statuses too', () => {
    // Batch 16 added them, and the log printed "ready_for_pickup → collected"
    // (found while verifying batch 18).
    expect(auditValueKey('delivery_status', 'ready_for_pickup')).toBe('deliveries.status.readyForPickup');
    expect(auditValueKey('delivery_status', 'collected')).toBe('deliveries.status.collected');
  });

  it('names roles', () => {
    expect(auditValueKey('role', 'cashier')).toBe('role.cashier');
  });

  it('leaves values it does not know as they are', () => {
    expect(auditValueKey('delivery_status', 'teleported')).toBeNull();
    expect(auditValueKey('display_name', 'سمية')).toBeNull();
  });
});
