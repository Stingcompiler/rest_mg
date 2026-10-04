/**
 * The kitchen's steps for a ticket, and the way back.
 *
 * The board used to move forward only: "served" by mistake took the ticket
 * off the board for good. Each step can now be taken back one.
 */
import type { KitchenStatus } from './api';

const ORDER: KitchenStatus[] = ['queued', 'preparing', 'ready', 'served'];

export function nextKitchenStatus(status: KitchenStatus): KitchenStatus | null {
  const index = ORDER.indexOf(status);
  return index >= 0 && index < ORDER.length - 1 ? ORDER[index + 1]! : null;
}

export function previousKitchenStatus(status: KitchenStatus): KitchenStatus | null {
  const index = ORDER.indexOf(status);
  return index > 0 ? ORDER[index - 1]! : null;
}
