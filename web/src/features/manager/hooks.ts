'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { INLINE_ERROR } from '@/lib/mutationMeta';

import {
  auditApi,
  customersApi,
  authApi,
  devicesApi,
  profileApi,
  reportsApi,
  staffApi,
  type NewStaffAccount,
  type AuditQuery,
  type BrandingChange,
  type CustomerQuery,
  type PageQuery,
  type NewSettlement,
  type RestaurantProfile,
  type StaffEdit,
} from './api';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: authApi.me });
}

export function useRevenue(params?: { from?: string; to?: string }) {
  return useQuery({ queryKey: ['revenue', params], queryFn: () => reportsApi.revenue(params) });
}

export function useOrders(query: PageQuery = {}) {
  return useQuery({
    queryKey: ['orders', query],
    queryFn: () => reportsApi.orders(query),
    // Keep the current page on screen while the next one loads, so paging
    // does not flash an empty list between clicks.
    placeholderData: keepPreviousData,
  });
}

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: profileApi.list });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({ meta: INLINE_ERROR,
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RestaurantProfile> }) =>
      profileApi.update(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: ['profile'] }),
  });
}

/** The landing page's logo and hero. Its own mutation, its own pending state. */
export function useBranding() {
  const client = useQueryClient();
  return useMutation({ meta: INLINE_ERROR,
    mutationFn: ({ id, change }: { id: string; change: BrandingChange }) =>
      profileApi.branding(id, change),
    onSuccess: () => client.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useDevices() {
  return useQuery({ queryKey: ['devices'], queryFn: devicesApi.list });
}

export function useEnrolDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ label, branchId }: { label: string; branchId: string }) =>
      devicesApi.enrol(label, branchId),
    onSuccess: () => client.invalidateQueries({ queryKey: ['devices'] }),
  });
}

export function useRevokeDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => devicesApi.revoke(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['devices'] }),
  });
}

export function useLogout() {
  return useMutation({ mutationFn: authApi.logout });
}

export function useStaff() {
  return useQuery({ queryKey: ['staff'], queryFn: staffApi.list });
}

export function useCreateStaff() {
  const client = useQueryClient();
  return useMutation({ meta: INLINE_ERROR,
    mutationFn: (body: NewStaffAccount) => staffApi.create(body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['staff'] });
      client.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useEditStaff() {
  const client = useQueryClient();
  return useMutation({ meta: INLINE_ERROR,
    mutationFn: ({ id, patch }: { id: string; patch: StaffEdit }) => staffApi.update(id, patch),
    onSuccess: () => {
      // An edit both changes the roster and writes a log entry, so refresh both.
      client.invalidateQueries({ queryKey: ['staff'] });
      client.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useDeactivateStaff() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => staffApi.deactivate(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['staff'] });
      client.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useAuditLog(query: AuditQuery = {}) {
  return useQuery({
    queryKey: ['audit', query],
    queryFn: () => auditApi.list(query),
    placeholderData: keepPreviousData,
  });
}

/** Everyone who appears in the log, for the "who" filter. */
export function useAuditActors() {
  return useQuery({ queryKey: ['audit', 'actors'], queryFn: auditApi.actors });
}

export function useCustomers(params: CustomerQuery = {}) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => customersApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useStatement(id: string | null, query: PageQuery = {}) {
  return useQuery({
    queryKey: ['customers', 'statement', id, query],
    queryFn: () => customersApi.statement(id as string, query),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

/** Every customer mutation moves a balance, so the list and the statement both
 *  go stale together. */
function useCustomerInvalidator() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['customers'] });
}

export function useCreateCustomer() {
  const invalidate = useCustomerInvalidator();
  return useMutation({ meta: INLINE_ERROR,
    mutationFn: (body: { name: string; phone?: string; note?: string }) => customersApi.create(body),
    onSuccess: invalidate,
  });
}

export function useRetireCustomer() {
  const invalidate = useCustomerInvalidator();
  return useMutation({ mutationFn: (id: string) => customersApi.retire(id), onSuccess: invalidate });
}

export function useSettleCustomer() {
  const invalidate = useCustomerInvalidator();
  return useMutation({ meta: INLINE_ERROR,
    mutationFn: ({ id, body }: { id: string; body: NewSettlement }) => customersApi.settle(id, body),
    onSuccess: invalidate,
  });
}
