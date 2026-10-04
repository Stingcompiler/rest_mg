/**
 * What a failure says to the person who caused it: a message key, never the
 * raw text.
 *
 * Screens showed whatever came back: the server's English message, "Request
 * failed.", or `String(error)`, which reads "TypeError: Failed to fetch" in the
 * middle of an Arabic screen. Others showed nothing (user-experience review,
 * batch 12). A server refusal is named by its code when the catalogue knows
 * it, and by its status otherwise.
 */
import { DomainError } from '@/domain';
import { hasMessage, type MessageKey } from '@/i18n';
import { ApiError } from './http';

export function describeError(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const known = `error.${error.code}`;
    if (error.code && hasMessage(known)) return known;
    if (error.status === 401) return 'error.session';
    if (error.status === 403) return 'error.forbidden';
    if (error.status === 404) return 'error.notFound';
    if (error.status === 429) return 'error.tooMany';
    if (error.status >= 500) return 'error.server';
    return 'error.refused';
  }
  if (error instanceof DomainError) {
    const known = `error.${error.code}`;
    return hasMessage(known) ? known : 'error.unknown';
  }
  // fetch rejects with a TypeError when the request never got an answer.
  if (error instanceof TypeError) return 'error.network';
  return 'error.unknown';
}
