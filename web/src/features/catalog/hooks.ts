'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { INLINE_ERROR } from '@/lib/mutationMeta';

import {
  categoriesApi,
  itemsApi,
  type CategoryInput,
  type MenuItemInput,
} from './api';

export function useCategories() {
  return useQuery({ queryKey: ['catalog', 'categories'], queryFn: categoriesApi.list });
}

export function useItems(categoryId?: string) {
  return useQuery({
    queryKey: ['catalog', 'items', categoryId ?? 'all'],
    queryFn: () => itemsApi.list(categoryId),
  });
}

/** Every catalogue mutation invalidates both collections — an item edit can
 *  change which category shows it, and a category edit changes the item filter. */
function useCatalogInvalidator() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['catalog'] });
}

export function useCreateCategory() {
  const invalidate = useCatalogInvalidator();
  return useMutation({ meta: INLINE_ERROR, mutationFn: (b: CategoryInput) => categoriesApi.create(b), onSuccess: invalidate });
}

export function useUpdateCategory() {
  const invalidate = useCatalogInvalidator();
  return useMutation({ meta: INLINE_ERROR,
    mutationFn: ({ id, body }: { id: string; body: CategoryInput & { is_active?: boolean } }) =>
      categoriesApi.update(id, body),
    onSuccess: invalidate,
  });
}

export function useDeactivateCategory() {
  const invalidate = useCatalogInvalidator();
  return useMutation({ mutationFn: (id: string) => categoriesApi.deactivate(id), onSuccess: invalidate });
}

export function useCreateItem() {
  const invalidate = useCatalogInvalidator();
  return useMutation({ meta: INLINE_ERROR, mutationFn: (b: MenuItemInput) => itemsApi.create(b), onSuccess: invalidate });
}

/**
 * The editor shows its own error; the quick toggles on a card do not, and
 * leave theirs to the notice.
 */
export function useUpdateItem(options: { inlineError?: boolean } = {}) {
  const invalidate = useCatalogInvalidator();
  return useMutation({
    meta: options.inlineError ? INLINE_ERROR : undefined,
    mutationFn: ({ id, body }: { id: string; body: MenuItemInput }) => itemsApi.update(id, body),
    onSuccess: invalidate,
  });
}

export function useRetireItem() {
  const invalidate = useCatalogInvalidator();
  return useMutation({ mutationFn: (id: string) => itemsApi.retire(id), onSuccess: invalidate });
}

export function useUploadItemImage() {
  const invalidate = useCatalogInvalidator();
  return useMutation({ meta: INLINE_ERROR,
    mutationFn: ({ id, file }: { id: string; file: File }) => itemsApi.uploadImage(id, file),
    onSuccess: invalidate,
  });
}
