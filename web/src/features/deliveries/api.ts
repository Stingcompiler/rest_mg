/**
 * Delivery orders — the fulfilment side of a public order.
 *
 * Reads the online orders the public site created and advances their
 * `delivery_status`. The financial record stays read-only; only that one
 * lifecycle field moves, through the server's transition guard. Shared by the
 * manager and the cashier (the server's IsOrderProcessor gates both).
 */
import { request } from '@/lib/http';
import type { Page } from '@/lib/paging';

export type DeliveryStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface DeliveryLine {
  id: string;
  item_id?: string | null;
  name_ar: string;
  name_en?: string;
  unit_price_minor: string;
  qty: number;
  line_total_minor: string;
}

export interface DeliveryOrder {
  id: string;
  number: string;
  type: string;
  status: string;
  channel: string;
  delivery_status: DeliveryStatus | '';
  /** The kitchen's own progress, shown read-only on the delivery board. */
  kitchen_status: string;
  total_minor: string;
  /** What is still to be collected; zero once a till has settled it. */
  amount_due_minor?: string;
  created_at: string;
  opened_at?: string;
  sent_at?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_area: string;
  customer_notes: string;
  lines: DeliveryLine[];
}

export const deliveriesApi = {
  // A delivery-only view (owner/manager/cashier), never the full order list.
  list: (query: { limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));
    const qs = params.toString();
    return request<Page<DeliveryOrder>>(`orders/deliveries${qs ? `?${qs}` : ''}`);
  },
  setStatus: (id: string, delivery_status: DeliveryStatus) =>
    request<DeliveryOrder>(`orders/${id}/delivery-status`, {
      method: 'POST',
      body: JSON.stringify({ delivery_status }),
    }),
};
