/**
 * The shared API client for the online surfaces.
 *
 * The manager dashboard and the kitchen display both talk to Django the same
 * way: same origin (the monolith), httpOnly cookies for auth, and one error
 * shape. The cashier is the exception and always will be — it reads and writes
 * IndexedDB and never calls this.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Refresh the access token, at most once at a time.
 *
 * The access cookie lasts minutes; the refresh cookie lasts a week. Without
 * this, a till that has been open for a quarter of an hour starts getting 401s
 * on everything — including its sync — and silently stops talking to the
 * server. Concurrent callers share one in-flight refresh so a burst of 401s
 * does not become a burst of refreshes.
 */
let refreshInFlight: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/v1/auth/refresh/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** A same-origin fetch that renews an expired session once and retries. */
export async function fetchWithSession(url: string, init?: RequestInit): Promise<Response> {
  const send = () => fetch(url, { ...init, credentials: 'include' });

  const first = await send();
  if (first.status !== 401) return first;
  // Never try to refresh the refresh itself.
  if (url.includes('/auth/')) return first;

  const renewed = await refreshSession();
  return renewed ? send() : first;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Django's routers require a trailing slash, and a POST cannot be redirected
  // to add one, so it is normalised here (before any query string).
  const [rawPath, query] = path.split('?');
  const withSlash = rawPath.endsWith('/') ? rawPath : `${rawPath}/`;
  const url = `/api/v1/${withSlash}${query ? `?${query}` : ''}`;

  // A multipart upload must set its own Content-Type, because only the browser
  // knows the boundary it generated. Forcing JSON here made every file upload
  // arrive as an unparseable body.
  const isUpload = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetchWithSession(url, {
    ...init,
    headers: {
      ...(isUpload ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error ?? {};
    throw new ApiError(response.status, error.code ?? 'error', error.message ?? 'Request failed.');
  }
  return body as T;
}

/**
 * A multipart upload — for a file, where `request`'s JSON content-type is wrong.
 * The browser sets the multipart boundary itself, so no Content-Type is passed;
 * session renewal and the error shape are shared with `request`.
 */
export async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const [rawPath, query] = path.split('?');
  const withSlash = rawPath.endsWith('/') ? rawPath : `${rawPath}/`;
  const url = `/api/v1/${withSlash}${query ? `?${query}` : ''}`;

  const response = await fetchWithSession(url, { method: 'POST', body: formData });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error ?? {};
    throw new ApiError(response.status, error.code ?? 'error', error.message ?? 'Upload failed.');
  }
  return body as T;
}

// --- identity, shared by every signed-in surface -----------------------------

export type StaffRole = 'owner' | 'manager' | 'cashier' | 'kitchen';

export interface StaffUser {
  id: string;
  username: string;
  role: StaffRole;
  display_name: string;
  branch_id: string | null;
}

export const authApi = {
  login: (username: string, password: string) =>
    request<StaffUser>('auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<void>('auth/logout', { method: 'POST' }),
  me: () => request<StaffUser>('auth/me'),
};

/** Where a role belongs after signing in. One place decides this. */
export const HOME_FOR_ROLE: Record<StaffRole, string> = {
  owner: '/manager/',
  manager: '/manager/',
  cashier: '/pos/',
  kitchen: '/kitchen/',
};

export function homeForRole(role: StaffRole): string {
  return HOME_FOR_ROLE[role] ?? '/';
}

/**
 * Where to send someone after they sign in, given a `?next` that may not be
 * theirs.
 *
 * A `next` is set by whoever was bounced to the login page last — and that is
 * often a *different* person. A cook signing out of the kitchen leaves
 * `next=/kitchen/`; the manager who signs in next would otherwise be carried
 * straight to the kitchen board, which is not their app. So `next` is honoured
 * only when it lies inside the signed-in role's own area, and otherwise
 * discarded in favour of that role's home. Deep links a person is entitled to
 * (`/manager/staff`) still work.
 *
 * It also has to be a plain in-app path: anything scheme- or host-shaped is an
 * open redirect waiting to happen, so it is refused.
 */
export function destinationAfterLogin(next: string | null, role: StaffRole): string {
  const home = homeForRole(role);
  if (!next) return home;
  // Relative, single-slash paths only — no "//evil.com", no "https://…".
  if (!next.startsWith('/') || next.startsWith('//')) return home;
  return next.startsWith(home) ? next : home;
}
