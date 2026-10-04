/**
 * Front-of-house steps for a website order: delivered to an address, or
 * collected at the counter (batch 16).
 *
 * Neither has a button for "preparing": that is the kitchen saying it started
 * cooking. Both wait on the kitchen before the step that claims there is food
 * to hand over, sending a rider out or calling the customer in.
 */
import type { DeliveryStatus } from './api';

interface FulfilmentOrder {
  type: string;
  delivery_status: string;
  kitchen_status?: string | null;
  kitchen_updated_at?: string | null;
}

const DELIVERY_NEXT: Partial<Record<string, DeliveryStatus>> = {
  pending: 'confirmed',
  confirmed: 'out_for_delivery',
  preparing: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

const PICKUP_NEXT: Partial<Record<string, DeliveryStatus>> = {
  pending: 'confirmed',
  confirmed: 'ready_for_pickup',
  preparing: 'ready_for_pickup',
  ready_for_pickup: 'collected',
};

const NEEDS_KITCHEN = new Set<DeliveryStatus>(['out_for_delivery', 'ready_for_pickup']);
const KITCHEN_READY = new Set(['ready', 'served']);

/** An hour at the counter: the server's expire_pickups cancels it as a no-show. */
export const PICKUP_WAIT_MS = 60 * 60_000;

export function isPickup(order: { type: string }): boolean {
  return order.type === 'takeaway';
}

export function nextStep(order: FulfilmentOrder): DeliveryStatus | null {
  const next = (isPickup(order) ? PICKUP_NEXT : DELIVERY_NEXT)[order.delivery_status || 'pending'];
  return next ?? null;
}

/** The next step is the kitchen's to unlock, not the reader's to take. */
export function waitingOnKitchen(order: FulfilmentOrder): boolean {
  const next = nextStep(order);
  return next !== null && NEEDS_KITCHEN.has(next) && !KITCHEN_READY.has(order.kitchen_status ?? '');
}

/** A pickup that has waited at the counter for an hour or more. */
export function isOverdue(order: FulfilmentOrder, now: number = Date.now()): boolean {
  if (!isPickup(order) || order.delivery_status !== 'ready_for_pickup' || !order.kitchen_updated_at) return false;
  return now - Date.parse(order.kitchen_updated_at) >= PICKUP_WAIT_MS;
}
