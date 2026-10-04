/**
 * One message carried across a client-side navigation: "the bill is closed",
 * shown on the screen the cashier lands on. It lives in memory only and is
 * read once.
 */
let pending: string | null = null;

export function setFlash(message: string): void {
  pending = message;
}

export function takeFlash(): string | null {
  const message = pending;
  pending = null;
  return message;
}
