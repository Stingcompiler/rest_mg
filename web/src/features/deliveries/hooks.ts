'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { INLINE_ERROR } from '@/lib/mutationMeta';

import { deliveriesApi, type DeliveryStatus } from './api';

export function useDeliveries(query: { limit?: number; offset?: number } = {}) {
  return useQuery({
    queryKey: ['deliveries', query],
    queryFn: () => deliveriesApi.list(query),
    // Poll so a new customer order appears without a manual refresh.
    refetchInterval: 15_000,
    // The poll must not blank the page the cashier is reading.
    placeholderData: keepPreviousData,
  });
}

export function useSetDeliveryStatus() {
  const client = useQueryClient();
  return useMutation({ meta: INLINE_ERROR,
    mutationFn: ({ id, status, reason }: { id: string; status: DeliveryStatus; reason?: string }) =>
      deliveriesApi.setStatus(id, status, reason),
    onSuccess: () => client.invalidateQueries({ queryKey: ['deliveries'] }),
  });
}
