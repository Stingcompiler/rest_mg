'use client';

/**
 * The start of a shift: what the drawer holds before the first sale.
 *
 * The till opened shifts silently with no float. Any change kept in the drawer
 * then read as a surplus at every close, and the cashier had to write a reason
 * for money that was never missing (user-experience review, batch 11). It is
 * asked once per shift; zero is a fine answer.
 */
import { useRef, useState } from 'react';

import { Button, Numeric, TextField } from '@/components';
import { useI18n } from '@/i18n';
import { digitsOnly } from '@/lib/digits';
import { useModalDialog } from '@/lib/useModalDialog';

export function OpeningFloatDialog({ onConfirm }: { onConfirm(amountMinor: bigint): Promise<void> }) {
  const i18n = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  const [raw, setRaw] = useState('');
  const [pending, setPending] = useState(false);
  // No way out but an answer: a shift without a float is the problem itself.
  useModalDialog(panel, () => undefined);

  const amount = BigInt(raw || '0');
  const start = async () => {
    setPending(true);
    try {
      await onConfirm(amount);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-24" dir={i18n.dir}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="opening-float-title"
        className="flex w-full max-w-md flex-col gap-16 rounded-lg border border-line bg-surface p-24 shadow-overlay"
      >
        <div className="flex flex-col gap-8">
          <h2 id="opening-float-title" className="text-ar-xl font-semibold text-text">
            {i18n.t('pos.float.title')}
          </h2>
          <p className="text-ar-base text-text-muted">{i18n.t('pos.float.body')}</p>
        </div>
        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('pos.float.amount')}
          <TextField
            value={raw}
            onChange={(event) => setRaw(digitsOnly(event.target.value).slice(0, 12))}
            onKeyDown={(event) => event.key === 'Enter' && !pending && void start()}
            inputMode="numeric"
            dir="ltr"
            placeholder="0"
          />
        </label>
        <Button variant="primary" size="lg" disabled={pending} onClick={() => void start()}>
          {amount > 0n ? (
            <span className="flex items-center gap-8">
              {i18n.t('pos.float.start')}
              <Numeric>{i18n.money(amount)}</Numeric>
            </span>
          ) : (
            i18n.t('pos.float.startEmpty')
          )}
        </Button>
      </div>
    </div>
  );
}
