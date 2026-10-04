/**
 * Why the public page could not be shown (batch 14). Only a 404 means there
 * is no page to show; anything else, a dropped line included, is worth trying
 * again. Every failure used to read "this page is not enabled".
 */
export type PageLoadFailure = 'not_enabled' | 'retry';

export function pageLoadFailure(failure: { status: number } | unknown): PageLoadFailure {
  const status = (failure as { status?: unknown } | null)?.status;
  return status === 404 ? 'not_enabled' : 'retry';
}
