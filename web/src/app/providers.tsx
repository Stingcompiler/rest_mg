'use client';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

/**
 * The three contexts every route sits inside: theme, locale, and who is signed
 * in. Kept in one client component so the server root layout stays a server
 * component (and can hold metadata) while these stay reactive beneath it.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>{children}</AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
