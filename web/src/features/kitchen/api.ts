import { request } from '@/lib/http';

/** What the kitchen is shown: food and timing, never money. */
export interface KitchenTicketLine {
  id: string;
  name_ar: string;
  name_en: string;
  qty: number;
  modifiers_text: string;
}

export type KitchenStatus = 'queued' | 'preparing' | 'ready' | 'served';

export interface KitchenTicket {
  id: string;
  number: string;
  type: string;
  status: string;
  kitchen_status: KitchenStatus;
  table_id: string | null;
  cashier_name: string;
  sent_at: string;
  lines: KitchenTicketLine[];
}

export const kitchenApi = {
  tickets: () => request<{ tickets: KitchenTicket[] }>('kitchen/tickets'),
  setStatus: (id: string, kitchen_status: KitchenStatus) =>
    request<KitchenTicket>(`kitchen/tickets/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ kitchen_status }),
    }),
};
