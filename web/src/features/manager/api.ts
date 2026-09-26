/**
 * The manager's API surface, on the shared client.
 *
 * This is the online half of the app, and the opposite of `/pos` in every way:
 * it calls Django directly on the same origin (the monolith). Requests carry
 * `credentials: 'include'` so the httpOnly cookies ride along — the token itself
 * never touches JavaScript.
 *
 * Money stays a string of minor units across the wire, exactly as it is stored
 * and displayed; only the field names are snake_case here, matching Django.
 */

import { ApiError, authApi, request, type StaffUser } from '@/lib/http';
import type { Page } from '@/lib/paging';

// Re-exported so manager code keeps importing from one place.
export { ApiError, authApi, request };
export type { Page };
export type ManagerUser = StaffUser;

/** Every paginated list takes the same two parameters. */
export interface PageQuery {
  limit?: number;
  offset?: number;
}

function withPaging(params: URLSearchParams, query: PageQuery = {}) {
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset) params.set('offset', String(query.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// --- reports ----------------------------------------------------------------

export interface RevenueReport {
  order_count: number;
  gross_minor: string;
  collected_minor: string;
  credit_outstanding_minor: string;
  average_ticket_minor: string;
  by_method: Record<string, string>;
  by_type: Record<string, number>;
  /** The rest of the flow: money still owed, given away, or lost. */
  discount_minor: string;
  by_type_minor: Record<string, string>;
  by_channel_minor: Record<string, string>;
  unpaid_order_count: number;
  unpaid_minor: string;
  pending_delivery_count: number;
  void_order_count: number;
  void_minor: string;
}

export interface OrderSummary {
  id: string;
  number: string;
  type: string;
  status: string;
  total_minor: string;
  amount_due_minor: string;
  closed_at: string | null;
  cashier_name: string;
}

export const reportsApi = {
  revenue: (params?: { from?: string; to?: string }) => {
    const search = new URLSearchParams(params as Record<string, string>).toString();
    return request<RevenueReport>(`reports/revenue${search ? `?${search}` : ''}`);
  },
  orders: (query: PageQuery = {}) =>
    request<Page<OrderSummary>>(`orders${withPaging(new URLSearchParams(), query)}`),
};

// --- restaurant profile -----------------------------------------------------

export interface RestaurantProfile {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  address_ar: string;
  address_en: string;
  phone: string;
  whatsapp: string;
  map_url: string;
  hours: { day_ar?: string; day_en?: string; open?: string; close?: string }[];
  photos: unknown[];
  delivery_links: unknown[];
  landing_page_enabled: boolean;
  prices_updated_at: string | null;
  /** Absolute, or null when the manager has not uploaded one yet. */
  logo_url: string | null;
  hero_image_url: string | null;
}

/** What to change in one branding request. Anything omitted is left alone. */
export interface BrandingChange {
  logo?: File;
  heroImage?: File;
  clearLogo?: boolean;
  clearHeroImage?: boolean;
}

export const profileApi = {
  list: () => request<RestaurantProfile[]>('profile'),
  update: (id: string, patch: Partial<RestaurantProfile>) =>
    request<RestaurantProfile>(`profile/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  /**
   * The landing page's logo and hero.
   *
   * Their own request, like a menu item's photo: one image can be replaced
   * without resubmitting the whole profile, and a slot can be emptied rather
   * than only overwritten.
   */
  branding: (id: string, change: BrandingChange) => {
    const form = new FormData();
    if (change.logo) form.append('logo', change.logo);
    if (change.heroImage) form.append('hero_image', change.heroImage);
    if (change.clearLogo) form.append('clear_logo', 'true');
    if (change.clearHeroImage) form.append('clear_hero_image', 'true');
    return request<RestaurantProfile>(`profile/${id}/branding`, { method: 'POST', body: form });
  },
};

// --- devices ----------------------------------------------------------------

export interface Device {
  id: string;
  label: string;
  branch_id: string;
  enrolled_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  /** Present exactly once, in the response to enrolment. */
  token?: string;
}

export const devicesApi = {
  list: () => request<Device[]>('devices'),
  enrol: (label: string, branchId: string) =>
    request<Device>('devices', { method: 'POST', body: JSON.stringify({ label, branch_id: branchId }) }),
  revoke: (id: string) => request<Device>(`devices/${id}/revoke`, { method: 'POST' }),
};

// --- staff accounts ---------------------------------------------------------

export interface StaffAccount {
  id: string;
  username: string;
  display_name: string;
  role: 'manager' | 'cashier' | 'kitchen' | 'owner';
  is_active: boolean;
}

export interface NewStaffAccount {
  username: string;
  display_name: string;
  role: string;
  password: string;
}

/** Every field is optional: an edit sends only what changed. */
export interface StaffEdit {
  username?: string;
  display_name?: string;
  role?: string;
  is_active?: boolean;
  password?: string;
}

export const staffApi = {
  list: () => request<StaffAccount[]>('staff'),
  create: (body: NewStaffAccount) =>
    request<StaffAccount>('staff', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, patch: StaffEdit) =>
    request<StaffAccount>(`staff/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deactivate: (id: string) => request<StaffAccount>(`staff/${id}`, { method: 'DELETE' }),
};

// --- activity log -----------------------------------------------------------

export type AuditAction =
  | 'staff.created'
  | 'staff.updated'
  | 'staff.deactivated'
  | 'staff.reactivated'
  | 'item.created'
  | 'item.updated'
  | 'item.retired'
  | 'item.image'
  | 'category.created'
  | 'category.updated'
  | 'category.deactivated'
  | 'price.bulk'
  | 'delivery.status';

/** Who appears in the log — including people who have since left. */
export interface AuditActor {
  id: string;
  name: string;
}

export interface AuditQuery extends PageQuery {
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
}

export interface AuditEntry {
  id: number;
  action: AuditAction;
  actor_id: string | null;
  actor_name: string;
  target_id: string | null;
  target_label: string;
  /** Shape depends on the action: for an edit, { field: [before, after] }. */
  metadata: Record<string, unknown>;
  created_at: string;
}

export const auditApi = {
  list: (query: AuditQuery = {}) => {
    const params = new URLSearchParams();
    if (query.actor) params.set('actor', query.actor);
    if (query.action) params.set('action', query.action);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    return request<Page<AuditEntry>>(`audit/log${withPaging(params, query)}`);
  },
  actors: () => request<AuditActor[]>('audit/log/actors'),
};

// --- customers and their accounts -------------------------------------------

export interface Customer {
  id: string;
  name: string;
  phone: string;
  note: string;
  is_active: boolean;
  /** Derived on the server: sold on credit, paid back, and the difference. */
  owed_minor: string;
  settled_minor: string;
  balance_minor: string;
}

export interface StatementLine {
  kind: 'charge' | 'settlement';
  id: string;
  at: string;
  amount_minor: string;
  order_number: string;
  method: string;
  reference: string;
}

/** A customer's ledger, paged like every other unbounded list. */
export type Statement = Page<StatementLine> & { customer: Customer };

export interface NewSettlement {
  amount_minor: string;
  method?: string;
  reference?: string;
  note?: string;
}

/**
 * The customers page, plus the branch-wide debt.
 *
 * `outstanding_minor` covers every customer the filter matched, not the ones on
 * this page — the screen shows it as a single headline figure, and summing the
 * visible rows would understate it by everything on page 2.
 */
export type CustomerPage = Page<Customer> & { outstanding_minor: string };

export interface CustomerQuery extends PageQuery {
  q?: string;
  owing?: boolean;
}

export const customersApi = {
  list: (params: CustomerQuery = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.owing) search.set('owing', 'true');
    return request<CustomerPage>(`customers${withPaging(search, params)}`);
  },
  create: (body: { name: string; phone?: string; note?: string }) =>
    request<Customer>('customers', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{ name: string; phone: string; note: string; is_active: boolean }>) =>
    request<Customer>(`customers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  retire: (id: string) => request<Customer>(`customers/${id}`, { method: 'DELETE' }),
  statement: (id: string, query: PageQuery = {}) =>
    request<Statement>(`customers/${id}/statement${withPaging(new URLSearchParams(), query)}`),
  settle: (id: string, body: NewSettlement) =>
    request<Customer>(`customers/${id}/settle`, { method: 'POST', body: JSON.stringify(body) }),
};
