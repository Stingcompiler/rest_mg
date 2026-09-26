/**
 * The catalogue admin API — categories and menu items.
 *
 * The online counterpart to the cashier's offline menu screen: this edits the
 * *structure* of the menu (create, rename, retire, re-price, feature, and
 * photograph items) directly against Django, on the same origin. The server
 * authorises it with `IsCatalogEditor`, so a manager, owner, or cashier may use
 * every call here; the UI mirrors that but the server is the real gate.
 *
 * Ids are generated on the client (the project's UUID rule) so a created row is
 * named before it is saved, exactly as the cashier tablet names its records.
 */
import { request, uploadFile } from '@/lib/http';

export interface Category {
  id: string;
  name_ar: string;
  name_en: string;
  sort: number;
  is_active: boolean;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  price_minor: string;
  is_available: boolean;
  is_active: boolean;
  is_featured: boolean;
  image_url: string | null;
  sort: number;
}

export interface CategoryInput {
  name_ar: string;
  name_en?: string;
  sort?: number;
}

export interface MenuItemInput {
  category_id: string;
  name_ar: string;
  name_en?: string;
  description_ar?: string;
  price_minor: string;
  is_available: boolean;
  is_featured: boolean;
  sort?: number;
}

const uuid = () => crypto.randomUUID();

export const categoriesApi = {
  list: () => request<Category[]>('catalog/categories'),
  create: (body: CategoryInput) =>
    request<Category>('catalog/categories', {
      method: 'POST',
      body: JSON.stringify({ id: uuid(), ...body }),
    }),
  update: (id: string, body: CategoryInput & { is_active?: boolean }) =>
    request<Category>(`catalog/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  // No hard delete: retiring a category sets it inactive, server-side.
  deactivate: (id: string) => request<Category>(`catalog/categories/${id}`, { method: 'DELETE' }),
};

export const itemsApi = {
  list: (categoryId?: string) =>
    request<MenuItem[]>(`catalog/items${categoryId ? `?category=${categoryId}` : ''}`),
  create: (body: MenuItemInput) =>
    request<MenuItem>('catalog/items', { method: 'POST', body: JSON.stringify({ id: uuid(), ...body }) }),
  update: (id: string, body: MenuItemInput) =>
    request<MenuItem>(`catalog/items/${id}`, { method: 'PUT', body: JSON.stringify({ id, ...body }) }),
  // Retire (soft-delete) an item.
  retire: (id: string) => request<MenuItem>(`catalog/items/${id}`, { method: 'DELETE' }),
  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append('image', file);
    return uploadFile<MenuItem>(`catalog/items/${id}/image`, form);
  },
};
