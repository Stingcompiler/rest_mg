/**
 * The domain: pure entities that guard the business rules and know nothing
 * about persistence, printing, the network, or React. Everything else in the
 * app depends inward on this; this depends on nothing outward.
 */
export { DomainError, type DomainErrorCode } from './errors';
export { type Money, ZERO, sumMoney, maxMoney, absMoney } from './money';
export { newId, WALK_IN_CUSTOMER_ID } from './ids';
export {
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
  type ShiftStatus,
  type Role,
  WORKING_STATUSES,
  TERMINAL_STATUSES,
} from './types';

export { OrderLine, type OrderLineSnapshot, type NewLineInput } from './OrderLine';
export { Payment, type PaymentSnapshot, type NewPaymentInput } from './Payment';
export { MenuItem, type MenuItemSnapshot } from './MenuItem';
export { Order, type OrderSnapshot, type NewOrderInput } from './Order';
export { CartSession } from './CartSession';
export { CashCount, type CashCountSnapshot } from './CashCount';
export { Shift, type ShiftSnapshot, type NewShiftInput, type ShiftBlockingReason } from './Shift';
export { User, type UserSnapshot, type Action } from './User';
