'use client';

/**
 * Menu management — category sidebar, a bulk-percent toolbar, and a row per item
 * with an editable price and an availability toggle. Every edit writes to
 * IndexedDB: a price change records history and queues for sync; an availability
 * change is a local override. Prices apply to the menu, never to an open order.
 */
import { useMemo, useState } from 'react';

import { AppHeader, Button, ConfirmDialog, EmptyState, Numeric, Toast, Toggle } from '@/components';
import { Utensils } from 'lucide-react';
import { toMinor, fromMinor } from '@/db';
import { useI18n } from '@/i18n';
import { usePos } from './PosProvider';
import { PosRail } from './PosRail';

const PERCENTS = [5, 10, 15, 20];

export function MenuManagementScreen() {
  const pos = usePos();
  const i18n = useI18n();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [percent, setPercent] = useState(15);
  const [edits, setEdits] = useState<Record<string, string>>({});
  // A raise across a category is one tap away from every price in it, and each
  // tap compounded: +15% twice is +32%. It asks first and says when it is done.
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [applying, setApplying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const activeCategoryId = categoryId ?? pos.categories[0]?.id ?? null;
  const category = useMemo(
    () => pos.categories.find((entry) => entry.id === activeCategoryId) ?? null,
    [pos.categories, activeCategoryId],
  );

  const commitPrice = (itemId: string, raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    if (digits) void pos.setItemPrice(itemId, toMinor(digits));
    setEdits((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  };

  return (
    <div className="flex h-screen bg-bg text-text" dir={i18n.dir}>
      <PosRail active="menu" />
      <div className="flex min-w-0 flex-1 flex-col pb-mobile-nav md:pb-0">
        <AppHeader
          title={i18n.t('pos.menu.title')}
          trailing={
            <>
              <span className="hidden text-ar-sm text-text-muted sm:inline">{i18n.t('pos.menu.savedLocally')}</span>
              {/* Quick price/availability lives here (offline). Full structural
                  editing — new items, photos, categories — is the online catalogue. */}
              <Button variant="secondary" onClick={() => window.location.assign('/catalog')}>
                {i18n.t('catalog.manage')}
              </Button>
            </>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* A side list on the tablet; a horizontal strip on the phone. */}
          <nav className="flex flex-none gap-8 overflow-x-auto border-b border-line bg-bg-sunken p-14 md:w-denomination-panel md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-e">
            {pos.categories.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setCategoryId(entry.id)}
                className={
                  entry.id === activeCategoryId
                    ? 'flex min-h-control-xl flex-none items-center whitespace-nowrap rounded-md bg-surface-2 px-14 text-ar-md font-medium text-text'
                    : 'flex min-h-control-xl flex-none items-center whitespace-nowrap rounded-md px-14 text-ar-md text-text-muted'
                }
              >
                {entry.nameAr}
              </button>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Wraps on a narrow screen: in one row it ran off a phone and a
                1024px tablet, the apply button out of reach (batch 31). */}
            <div className="flex flex-none flex-wrap items-center gap-12 border-b border-line bg-surface px-16 py-14">
              <span className="text-ar-base text-text-muted">{i18n.t('pos.menu.bulkChange')}</span>
              <div className="flex gap-8">
                {PERCENTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    dir="ltr"
                    onClick={() => setPercent(value)}
                    className={
                      value === percent
                        ? 'flex min-h-control-lg items-center rounded-md border-strong border-accent px-16 text-num-md font-semibold text-accent'
                        : 'flex min-h-control-lg items-center rounded-md border border-line bg-surface-2 px-16 text-num-md text-text'
                    }
                  >
                    <Numeric>{`+${value}%`}</Numeric>
                  </button>
                ))}
              </div>
              <div className="ms-auto">
                <Button
                  variant="primary"
                  disabled={!category || category.items.length === 0}
                  onClick={() => setConfirmingBulk(true)}
                >
                  {i18n.plural('pos.menu.applyToItems', category?.items.length ?? 0)}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-16">
              {!category || category.items.length === 0 ? (
                <EmptyState title={i18n.t('pos.menu.title')} icon={<Utensils size={30} />} />
              ) : (
                <div className="flex flex-col gap-8">
                  {category.items.map((item) => {
                    const snapshot = item.toSnapshot();
                    const editing = edits[item.id];
                    const priceText = editing ?? i18n.money(item.priceMinor);
                    return (
                      // The name on its own line on a phone, so the switch stays
                      // inside the card; one line from 640px (found verifying batch 31).
                      <div key={item.id} className="flex flex-wrap items-center gap-x-16 gap-y-10 rounded-lg border border-line bg-surface p-14">
                        <span className={item.isAvailable() ? 'min-w-0 flex-1 basis-full text-ar-md font-medium text-text sm:basis-0' : 'min-w-0 flex-1 basis-full text-ar-md font-medium text-text-disabled sm:basis-0'}>
                          {snapshot.nameAr}
                        </span>
                        <input
                          inputMode="numeric"
                          aria-label={i18n.t('pos.menu.priceLabel')}
                          className="numeric h-control-lg w-price-field rounded-md border border-line bg-surface-2 px-14 text-end text-num-md text-text outline-none focus-visible:border-strong focus-visible:border-accent"
                          value={priceText}
                          onChange={(event) => setEdits((current) => ({ ...current, [item.id]: event.target.value }))}
                          onFocus={() => setEdits((current) => ({ ...current, [item.id]: fromMinor(item.priceMinor) }))}
                          onBlur={(event) => commitPrice(item.id, event.target.value)}
                        />
                        <span className={item.isAvailable() ? 'text-ar-sm text-text-muted sm:w-price-field' : 'text-ar-sm text-warning sm:w-price-field'}>
                          {item.isAvailable() ? i18n.t('pos.menu.available') : i18n.t('pos.menu.unavailable')}
                        </span>
                        <span className="ms-auto flex sm:ms-0">
                          <Toggle
                            checked={item.availableFlag}
                            onChange={() => void pos.toggleItemAvailability(item.id)}
                            label={snapshot.nameAr}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmingBulk}
        tone="accent"
        title={i18n.plural('pos.menu.bulkTitle', category?.items.length ?? 0, {
          percent: i18n.int(percent),
          category: category?.nameAr ?? '',
        })}
        body={i18n.t('pos.menu.bulkBody')}
        confirmLabel={i18n.t('pos.menu.bulkConfirm', { percent: i18n.int(percent) })}
        cancelLabel={i18n.t('common.back')}
        pending={applying}
        onCancel={() => setConfirmingBulk(false)}
        onConfirm={() => {
          if (!activeCategoryId) return;
          setApplying(true);
          pos
            .bulkPriceChange(activeCategoryId, percent)
            .then(() => setToast(i18n.plural('pos.menu.bulkDone', category?.items.length ?? 0)))
            .finally(() => {
              setApplying(false);
              setConfirmingBulk(false);
            });
        }}
      />
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
