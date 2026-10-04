'use client';

/**
 * One sign-in for everyone — manager, cashier, kitchen.
 *
 * On success it sends the person to *their* app, decided by role in one place
 * (`homeForRole`). A full navigation rather than a client push: this is a
 * cross-app transition in a static export, and a fresh load guarantees the
 * destination mounts with the cookie in place.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Button, TextField } from '@/components';
import { useI18n } from '@/i18n';
import { ApiError, destinationAfterLogin } from '@/lib/http';
import { useAuth } from './AuthProvider';

export function LoginScreen() {
  const i18n = useI18n();
  const auth = useAuth();
  const search = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<'credentials' | 'throttled' | 'network' | null>(null);
  const [pending, setPending] = useState(false);

  // Already signed in? Then this page has nothing to ask. Someone arrives here
  // with a live session more often than it sounds — an old /manager/login
  // bookmark redirects here, and so does a stale link — and showing the form to
  // a signed-in person invites them to "log in" to the account they are already
  // using. Send them to their own app instead.
  const signedInRole = auth.user?.role;
  useEffect(() => {
    if (auth.loading || !signedInRole) return;
    window.location.replace(destinationAfterLogin(search.get('next'), signedInRole));
  }, [auth.loading, signedInRole, search]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const user = await auth.signIn(username, password);
      // A `next` is honoured only if it belongs to this person's app — it is
      // often left behind by whoever was bounced here last, and a manager
      // should not inherit the cook's destination.
      window.location.assign(destinationAfterLogin(search.get('next'), user.role));
    } catch (caught) {
      // Only a refusal means the password was wrong. A server error or no
      // line at all used to leave the button disabled with nothing said, or
      // blame the password for an outage.
      if (caught instanceof ApiError && caught.status === 429) setError('throttled');
      else if (caught instanceof ApiError && caught.status < 500) setError('credentials');
      else setError('network');
      setPending(false);
    }
  };

  // While the session is still being resolved, or while the redirect above is
  // in flight, render nothing rather than flashing a form that is about to
  // vanish.
  if (auth.loading || signedInRole) {
    return <main className="min-h-screen bg-bg" dir={i18n.dir} />;
  }

  return (
    <main
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-16 p-24"
      dir={i18n.dir}
    >
      <h1 className="text-ar-xl font-semibold">{i18n.t('auth.signInTitle')}</h1>
      <form onSubmit={submit} className="flex flex-col gap-12">
        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('manager.login.username')}
          <TextField
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('manager.login.password')}
          <TextField
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error ? (
          <span role="alert" className="text-ar-sm text-danger">
            {i18n.t(
              error === 'throttled'
                ? 'manager.login.throttled'
                : error === 'network'
                  ? 'login.networkError'
                  : 'manager.login.error',
            )}
          </span>
        ) : null}
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {i18n.t('manager.login.submit')}
        </Button>
      </form>
    </main>
  );
}
