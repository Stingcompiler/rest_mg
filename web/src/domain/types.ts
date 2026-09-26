export type OrderStatus = 'open' | 'parked' | 'sent' | 'closed' | 'void';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type PaymentMethod = 'cash' | 'bank' | 'wallet' | 'credit';
export type ShiftStatus = 'open' | 'closed';
export type Role = 'cashier' | 'manager';

/** Statuses in which an order is still on the floor and may change. */
export const WORKING_STATUSES: readonly OrderStatus[] = ['open', 'parked', 'sent'];

/** Statuses in which an order is history and may never change again. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['closed', 'void'];
