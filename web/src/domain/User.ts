/**
 * A user and what they may do.
 *
 * The only actor on the tablet is the cashier; the manager acts on the
 * dashboard. `can(action)` is the single gate the UI asks before offering an
 * action, so the permission matrix lives in one readable place rather than
 * scattered across screens.
 */
import type { Role } from './types';

export type Action =
  | 'take_order'
  | 'take_payment'
  | 'apply_discount'
  | 'void_line'
  | 'split_bill'
  | 'open_shift'
  | 'close_shift'
  | 'edit_menu_price'
  | 'bulk_price_change'
  | 'manage_menu_structure'
  | 'view_reports'
  | 'enrol_device';

const CASHIER_ACTIONS: readonly Action[] = [
  'take_order',
  'take_payment',
  'apply_discount',
  'void_line',
  'split_bill',
  'open_shift',
  'close_shift',
  'edit_menu_price',
  'bulk_price_change',
];

// A manager can do everything a cashier can, plus the structural and reporting
// actions that only exist on the dashboard.
const MANAGER_ACTIONS: readonly Action[] = [
  ...CASHIER_ACTIONS,
  'manage_menu_structure',
  'view_reports',
  'enrol_device',
];

const PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  cashier: new Set(CASHIER_ACTIONS),
  manager: new Set(MANAGER_ACTIONS),
};

export interface UserSnapshot {
  id: string;
  nameAr: string;
  nameEn: string;
  role: Role;
}

export class User {
  private constructor(private state: UserSnapshot) {}

  static fromSnapshot(snapshot: UserSnapshot): User {
    return new User({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get role(): Role {
    return this.state.role;
  }

  can(action: Action): boolean {
    return PERMISSIONS[this.state.role].has(action);
  }

  toSnapshot(): UserSnapshot {
    return { ...this.state };
  }
}
