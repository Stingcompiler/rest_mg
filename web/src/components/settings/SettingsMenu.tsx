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
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={i18n.t('settings.title')}
        aria-expanded={open}
        className="flex size-control-md items-center justify-center rounded-md border border-line bg-surface-2 text-text outline-none"
      >
        <SettingsIcon size={20} />
      </button>

      {open ? (
        <div
          className="absolute top-full z-50 mt-8 flex w-80 flex-col gap-14 rounded-lg border border-line bg-surface p-16 shadow-card"
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
        </div>
      ) : null}
    </div>
  );
}
