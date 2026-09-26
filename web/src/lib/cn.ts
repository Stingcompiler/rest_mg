/**
 * Join class names, dropping falsy ones. Small enough not to warrant a
 * dependency; every component uses it to compose token classes.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
