'use client';

/**
 * Who is signed in, shared by every surface.
 *
 * This is where the one real tension in a multi-user POS is resolved. Staff now
 * sign in against the server, which gives each cashier their own account and
 * their own shift — but the cashier tablet must keep working when the internet
 * does not. So:
 *
 *   - a successful sign-in caches the identity locally;
 *   - on load we ask the server who we are, and a **401 signs you out** — that
 *     is a real answer;
 *   - but a **network failure is not an answer**, so we fall back to the cached
 *     identity and carry on. A cashier who signed in this morning keeps working
 *     all shift with the line down.
 *
 * The httpOnly refresh cookie is long-lived for the same reason. The trade is
 * that a device must reach the server *once* to sign a person in.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, authApi, homeForRole, type StaffUser } from '@/lib/http';
import { announceWhatIsWaiting } from '@/features/alerts/memory';

const CACHE_KEY = 'sp-user';

function readCache(): StaffUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as StaffUser) : null;
  } catch {
    return null;
  }
}

function writeCache(user: StaffUser | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (user) window.localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // A preference store being unavailable never breaks a sign-in.
  }
}

interface AuthContextValue {
  user: StaffUser | null;
  /** True until the first answer (server or cache) is in. */
  loading: boolean;
  /** The server said no. Distinct from "we could not ask". */
  unauthenticated: boolean;
  signIn(username: string, password: string): Promise<StaffUser>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthenticated, setUnauthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = readCache();
      if (cached && !cancelled) setUser(cached); // paint immediately

      try {
        const fresh = await authApi.me();
        if (cancelled) return;
        setUser(fresh);
        writeCache(fresh);
        setUnauthenticated(false);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          // A real "no". Forget the cached identity.
          setUser(null);
          writeCache(null);
          setUnauthenticated(true);
        }
        // Otherwise the network is down: keep the cached user and carry on.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const signedIn = await authApi.login(username, password);
    // Whoever just signed in has seen nothing yet. Orders already waiting are
    // news to them, so the boards forget what the previous person was told.
    announceWhatIsWaiting();
    setUser(signedIn);
    writeCache(signedIn);
    setUnauthenticated(false);
    return signedIn;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server cannot be reached, drop the local identity.
    }
    setUser(null);
    writeCache(null);
    setUnauthenticated(true);
    if (typeof window !== 'undefined') window.location.assign('/login/');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, unauthenticated, signIn, signOut }),
    [user, loading, unauthenticated, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}

export { homeForRole };
