'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { Toast } from '@/components';
import { useI18n, type MessageKey } from '@/i18n';
import { describeError } from '@/lib/describeError';
import type { MutationMeta } from '@/lib/mutationMeta';
import { ApiError } from './api';

/**
 * TanStack Query is the manager's data layer — the online counterpart to the
 * cashier's IndexedDB. A 401 from the API means the session lapsed; there is no
 * point retrying it, so those are never retried, and the query owner sends the
 * manager back to sign in.
 *
 * Every failed mutation is reported here, once, in the person's language. The
 * review found deactivating a category, revoking a device or retiring a
 * customer could fail with nothing on screen (batch 12). A form that shows its
 * own error marks its mutation `inlineError`, and this stays quiet for it.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const i18n = useI18n();
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [client] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if ((mutation.meta as MutationMeta | undefined)?.inlineError) return;
            setNotice(describeError(error));
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {notice ? <Toast message={i18n.t(notice)} onDismiss={() => setNotice(null)} durationMs={8_000} /> : null}
    </QueryClientProvider>
  );
}
