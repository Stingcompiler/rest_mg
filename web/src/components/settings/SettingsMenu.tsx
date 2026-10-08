'use client';

/**
 * Display settings — theme, language, and numerals — reachable from every app.
 *
 * These three are independent on purpose: an Arabic cashier may prefer Western
 * digits, and the theme follows the room's light, not the language. Each choice
 * persists to localStorage and applies immediately, with no reload and without
 * losing an open order.
 */
import { useEffect, useRef, useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

import { Button, IconButton, TextField } from '../primitives/controls';
import { authApi } from '@/lib/http';
import { describeError } from '@/lib/describeError';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n, type Locale, type Numerals } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemePreference } from '@/i18n/preferences';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <span className="text-ar-sm text-text-muted">{label}</span>
      <div className="flex gap-6">{children}</div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'min-h-control-sm flex-1 rounded-md border-strong border-accent bg-accent-tint px-12 text-ar-sm font-medium text-accent'
          : 'min-h-control-sm flex-1 rounded-md border border-line bg-surface-2 px-12 text-ar-sm text-text'
      }
    >
      {children}
    </button>
  );
}

export function SettingsMenu() {
  const i18n = useI18n();
  const theme = useTheme();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape — a panel that traps you is worse than
  // no panel, especially mid-service.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const themes: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: i18n.t('settings.theme.light') },
    { value: 'dark', label: i18n.t('settings.theme.dark') },
    { value: 'system', label: i18n.t('settings.theme.system') },
  ];
  const locales: { value: Locale; label: string }[] = [
    { value: 'ar', label: i18n.t('settings.locale.ar') },
    { value: 'en', label: i18n.t('settings.locale.en') },
  ];
  const numerals: { value: Numerals; label: string }[] = [
    { value: 'arabic-indic', label: i18n.t('settings.numerals.arabicIndic') },
    { value: 'western', label: i18n.t('settings.numerals.western') },
  ];

  return (
    <div className="relative" ref={panel}>
      <IconButton label={i18n.t('settings.title')} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <SettingsIcon size={20} />
      </IconButton>

      {open ? (
        <div
          className="absolute top-full z-50 mt-8 flex w-popover max-w-[calc(100vw-2rem)] flex-col gap-14 rounded-lg border border-line bg-surface p-16 shadow-overlay"
          style={{ insetInlineEnd: 0 }}
        >
          <Row label={i18n.t('settings.title')}>
            {themes.map((option) => (
              <Choice
                key={option.value}
                active={theme.preference === option.value}
                onClick={() => theme.setTheme(option.value)}
              >
                {option.label}
              </Choice>
            ))}
          </Row>

          <Row label={i18n.t('settings.language')}>
            {locales.map((option) => (
              <Choice
                key={option.value}
                active={i18n.locale === option.value}
                onClick={() => i18n.setLocale(option.value)}
              >
                {option.label}
              </Choice>
            ))}
          </Row>

          <Row label={i18n.t('settings.numerals')}>
            {numerals.map((option) => (
              <Choice
                key={option.value}
                active={i18n.numerals === option.value}
                onClick={() => i18n.setNumerals(option.value)}
              >
                {option.label}
              </Choice>
            ))}
          </Row>

          {auth.user ? <ChangePassword /> : null}

          {auth.user ? <SignOutEverywhere onDone={() => setOpen(false)} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Ending every session of the signed-in person — for someone who thinks a
 * device or their password was taken. Two steps, because it signs them out
 * everywhere, this device included.
 */
function SignOutEverywhere({ onDone }: { onDone: () => void }) {
  const i18n = useI18n();
  const auth = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    setPending(true);
    setFailed(false);
    try {
      await auth.signOutEverywhere();
      onDone();
    } catch {
      setFailed(true);
      setPending(false);
    }
  };

  return (
    <Row label={i18n.t('settings.session')}>
      <div className="flex flex-1 flex-col gap-8">
        {confirming ? (
          <>
            <span className="text-ar-sm text-text-muted">{i18n.t('auth.signOutEverywhereConfirm')}</span>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={pending}
              className="min-h-control-sm rounded-md border border-danger bg-danger-tint px-12 text-ar-sm font-medium text-danger disabled:opacity-60"
            >
              {i18n.t('auth.signOutEverywhere')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="min-h-control-sm rounded-md border border-line bg-surface-2 px-12 text-ar-sm text-danger"
          >
            {i18n.t('auth.signOutEverywhere')}
          </button>
        )}
        {failed ? (
          <span role="alert" className="text-ar-sm text-danger">
            {i18n.t('auth.signOutEverywhereFailed')}
          </span>
        ) : null}
      </div>
    </Row>
  );
}

/**
 * Changing your own password, with the current one. The server ends every other
 * session and renews this one, so the person carries on where they were.
 */
function ChangePassword() {
  const i18n = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next !== repeat) {
      setError(i18n.t('auth.passwordsDiffer'));
      return;
    }
    setPending(true);
    try {
      await authApi.changePassword(current, next);
      setDone(true);
      setOpen(false);
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch (caught) {
      setError(i18n.t(describeError(caught)));
    } finally {
      setPending(false);
    }
  };

  return (
    <Row label={i18n.t('settings.password')}>
      <div className="flex flex-1 flex-col gap-8">
        {open ? (
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-8">
            <TextField
              type="password"
              label={i18n.t('auth.currentPassword')}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoComplete="current-password"
              required
            />
            <TextField
              type="password"
              label={i18n.t('auth.newPassword')}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <TextField
              type="password"
              label={i18n.t('auth.repeatPassword')}
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            {error ? (
              <span role="alert" className="text-ar-sm text-danger">
                {error}
              </span>
            ) : null}
            <Button type="submit" variant="primary" disabled={pending || !current || !next || !repeat}>
              {i18n.t('auth.changePassword')}
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setDone(false);
            }}
            className="min-h-control-sm rounded-md border border-line bg-surface-2 px-12 text-ar-sm text-text"
          >
            {i18n.t('auth.changePassword')}
          </button>
        )}
        {done ? (
          <span role="status" className="text-ar-sm text-success">
            {i18n.t('auth.passwordChanged')}
          </span>
        ) : null}
      </div>
    </Row>
  );
}
