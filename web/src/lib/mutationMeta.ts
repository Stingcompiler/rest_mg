/**
 * How a mutation's failure is shown.
 *
 * Every failed mutation is reported by the query client in one notice
 * (features/manager/QueryProvider), so no screen can forget to. A form that
 * shows its own error next to its fields marks its mutation with this, and the
 * notice stays quiet for it.
 */
export const INLINE_ERROR = { inlineError: true } as const;

export interface MutationMeta extends Record<string, unknown> {
  inlineError?: boolean;
}
