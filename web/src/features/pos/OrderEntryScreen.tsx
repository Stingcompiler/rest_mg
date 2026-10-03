'use client';

/**
 * Order entry. Rail · item area · cart panel, exactly the v2 geometry.
 *
 * Everything on screen is read from the in-memory domain entities the provider
 * holds; nothing is fetched, and every tap mutates an entity and repaints before
 * the background write to IndexedDB has even resolved.
 *
 * Two geometries, one screen. On a tablet at the till (md and up) the cart is a
 * fixed panel on the end edge, always in view. On a phone there is no room for
 * three columns, so the cart collapses to a **summary bar** above the bottom
 * nav — item count and total, with the two things a cashier reaches for, send
 * and pay — and expands to a **full sheet** for line-by-line work. The bar keeps
 * the running total visible the whole time, which is the one thing the cashier
 * must never lose on a small screen.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, Search, ShoppingCart, X } from 'lucide-react';

import {
  AppHeader,
  Button,
  CartAction,
  CartActionBar,
  CartLine,
  CartTabs,
  CategoryTab,
  EmptyState,
  LoadingList,
  MenuItemCard,
  Numeric,
  QtyStepper,
  SearchField,
  SegmentedControl,
  SettingsMenu,
  StatusChip,
  TextField,
  TotalsBlock,
} from '@/components';
import { formatTime, useI18n } from '@/i18n';
import { getPrintService } from '@/print';
import { DomainError, type OrderType } from '@/domain';
import { usePos } from './PosProvider';
import { PosRail } from './PosRail';

export function OrderEntryScreen() {
  const pos = usePos();
  const i18n = useI18n();
  const router = useRouter();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cartOpen, setCartOpen] = useState(false); // the mobile cart sheet

  const currentCategoryId = activeCategoryId ?? pos.categories[0]?.id ?? null;

  const visibleItems = useMemo(() => {
    const term = query.trim();
    if (term) {
      return pos.categories.flatMap((category) =>
        category.items.filter((item) => item.toSnapshot().nameAr.includes(term)),
      );
    }
    return pos.categories.find((category) => category.id === currentCategoryId)?.items ?? [];
  }, [pos.categories, currentCategoryId, query]);

  const order = pos.activeOrder;
  const orderSnapshot = order?.toSnapshot();
  const liveLines = orderSnapshot?.lines.filter((line) => !line.isVoid) ?? [];
  const hasLines = liveLines.length > 0;
  const [discountOpen, setDiscountOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const orderTypes: { value: OrderType; label: string }[] = [
    { value: 'dine_in', label: i18n.t('pos.orderType.dineIn') },
    { value: 'takeaway', label: i18n.t('pos.orderType.takeaway') },
    { value: 'delivery', label: i18n.t('pos.orderType.delivery') },
  ];

  const cartTabs = pos.cart.list().map((cartOrder) => ({
    id: cartOrder.id,
    label: cartOrder.toSnapshot().number,
    total: i18n.money(cartOrder.total()),
  }));

  // Escape closes the mobile cart sheet, matching every other overlay.
  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCartOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cartOpen]);

  // The cart's contents, shared verbatim by the desktop panel and the mobile
  // sheet — one source of truth so the two geometries never drift apart.
  const cartContents = (
    <>
      <div className="flex-none p-14 pb-0">
        <CartTabs
          tabs={cartTabs}
          activeId={order?.id ?? ''}
          onSelect={pos.switchCart}
          onAdd={() => void pos.newCart()}
          addLabel={i18n.t('pos.title')}
        />
      </div>

      {order ? (
        /* Every bill used to go down as dine-in; the kitchen and the reports
           need to know a takeaway from a table. */
        <div className="flex-none px-14 pt-10">
          <SegmentedControl
            options={orderTypes}
            value={order.type}
            onChange={pos.setOrderType}
            ariaLabel={i18n.t('pos.orderType.label')}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-14">
        {liveLines.length === 0 ? (
          <EmptyState title={i18n.t('pos.cart.empty')} icon={<Wallet size={30} />} />
        ) : (
          <div className="flex flex-col gap-8">
            {liveLines.map((line) => (
              <CartLine
                key={line.id}
                name={line.nameAr}
                modifiers={line.modifiersText || undefined}
                total={i18n.money(line.unitPriceMinor * BigInt(line.qty))}
                stepper={
                  <QtyStepper
                    qty={i18n.int(line.qty)}
                    decrementLabel={i18n.t('pos.cart.qtyLess', { name: line.nameAr })}
                    incrementLabel={i18n.t('pos.cart.qtyMore', { name: line.nameAr })}
                    onDecrement={() => pos.changeQty(line.id, -1)}
                    onIncrement={() => pos.changeQty(line.id, +1)}
                  />
                }
              />
            ))}
          </div>
        )}
      </div>

      {order && hasLines ? (
        <div className="flex flex-none flex-col gap-12 border-t border-line bg-surface-2 p-14">
          <CartActionBar>
            {/* Discount was wired to nothing, though the entity has supported
                it all along. The other two have no entity behind them at all,
                so they say so rather than swallowing the press. */}
            <CartAction label={i18n.t('pos.actions.discount')} onClick={() => setDiscountOpen(true)} />
            <CartAction label={i18n.t('pos.actions.note')} onClick={() => setNoteOpen(true)} />
            <CartAction label={i18n.t('pos.actions.split')} disabled hint={i18n.t('pos.actions.soon')} />
            <CartAction label={i18n.t('pos.actions.hold')} onClick={pos.parkActive} />
          </CartActionBar>
          <TotalsBlock
            rows={[
              { label: i18n.t('pos.cart.subtotal'), value: i18n.money(order.subtotal()) },
              // Only when there is one — an applied discount that never appears
              // on the bill is how a total stops being explainable.
              ...(orderSnapshot && orderSnapshot.discountMinor > 0n
                ? [
                    {
                      label: i18n.t('pos.cart.discount'),
                      value: `-${i18n.money(orderSnapshot.discountMinor)}`,
                      tone: 'success' as const,
                    },
                  ]
                : []),
            ]}
            totalLabel={i18n.t('pos.cart.total')}
            totalValue={i18n.money(order.total())}
          />
          <div className="grid grid-cols-[1fr_1.25fr] gap-10">
            {/* The entity refuses to send an empty order, so the button says so
                first rather than letting the press fail silently. Both of these
                had no hover or pressed state at all: on a touch screen that is
                the difference between a tap that registered and one that missed. */}
            <button
              type="button"
              disabled={!hasLines}
              title={hasLines ? undefined : i18n.t('pos.cart.nothingToSend')}
              onClick={() => {
                pos.sendToKitchen();
                setCartOpen(false);
              }}
              className="inline-flex min-h-control-2xl items-center justify-center rounded-lg border border-strong text-ar-lg font-medium text-text outline-none transition-colors hover:bg-surface-2 active:bg-surface-3 disabled:cursor-not-allowed disabled:border-line disabled:text-text-disabled disabled:hover:bg-transparent"
            >
              {i18n.t('pos.cart.sendToKitchen')}
            </button>
            <button
              type="button"
              disabled={!hasLines}
              onClick={() => router.push('/pos/payment')}
              className="inline-flex min-h-control-2xl flex-col items-center justify-center rounded-lg bg-accent text-text-on-accent outline-none transition-colors hover:bg-accent-hover active:bg-accent-pressed disabled:bg-surface-quiet disabled:text-text-disabled"
            >
              <span className="text-ar-lg font-semibold">{i18n.t('pos.cart.pay')}</span>
              <Numeric className="text-num-base">{i18n.money(order.total())}</Numeric>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="flex h-screen bg-bg text-text" dir={i18n.dir}>
      <PosRail active="order" />

      <div className="flex min-w-0 flex-1 flex-col pb-mobile-nav md:pb-0">
        <AppHeader
          title={<SearchField icon={<Search size={20} />} placeholder={i18n.t('pos.search.placeholder')} value={query} onChange={(event) => setQuery(event.target.value)} />}
          trailing={
            <>
              <StatusChip
                label={pos.online ? i18n.t('pos.status.online') : i18n.t('pos.status.offline')}
                tone={pos.online ? 'success' : 'warning'}
                dot
              />
              {pos.pendingCount > 0 ? (
                <button type="button" onClick={pos.syncNow} className="outline-none">
                  <StatusChip
                    label={i18n.t('pos.status.pendingCount', { count: i18n.int(pos.pendingCount) })}
                    tone="neutral"
                  />
                </button>
              ) : null}
              {/* In a browser there is no thermal printer: kitchen tickets and
                  receipts go nowhere, and the queue would still report them
                  done. Said plainly, so the kitchen screen and the browser's
                  print button are known to be the way. */}
              {getPrintService().simulated ? (
                <span className="hidden md:inline" title={i18n.t('pos.printer.simulatedHint')}>
                  <StatusChip label={i18n.t('pos.printer.simulated')} tone="neutral" />
                </span>
              ) : null}
              <Numeric className="hidden text-num-base sm:inline">{formatTime(new Date())}</Numeric>
              <SettingsMenu />
            </>
          }
        />

        {pos.saveFailed ? (
          <div
            role="alert"
            className="mx-16 mt-14 flex items-center justify-between gap-12 rounded-lg border border-danger bg-danger-tint px-14 py-10 text-ar-base text-danger sm:mx-18"
          >
            <span>{i18n.t('pos.saveFailed')}</span>
            <button type="button" onClick={pos.dismissSaveFailure} className="flex-none text-ar-sm font-medium underline">
              {i18n.t('pos.saveFailedDismiss')}
            </button>
          </div>
        ) : null}

        {!pos.ready ? (
          <div className="p-18">
            <LoadingList rows={6} rowClassName="h-item-card" />
          </div>
        ) : pos.categories.length === 0 ? (
          /* A fresh till has no menu until the first sync brings the server's.
             It used to fill the gap with a demo menu nobody could sell from. */
          <div className="flex flex-1 flex-col items-center justify-center gap-12 p-24 text-center">
            <span className="text-ar-lg text-text-muted">{i18n.t('pos.menu.waiting')}</span>
            <button
              type="button"
              onClick={pos.syncNow}
              className="min-h-control-md rounded-md border border-line bg-surface-2 px-16 text-ar-base"
            >
              {i18n.t('pos.menu.syncNow')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-none gap-8 overflow-x-auto px-16 pt-14 sm:px-18">
              {pos.categories.map((category) => (
                <CategoryTab
                  key={category.id}
                  label={category.nameAr}
                  count={i18n.int(category.items.length)}
                  active={category.id === currentCategoryId && !query}
                  onClick={() => {
                    setQuery('');
                    setActiveCategoryId(category.id);
                  }}
                />
              ))}
            </div>

            {/* Extra bottom room on mobile so the last items clear the summary bar. */}
            <div className={`min-h-0 flex-1 overflow-y-auto p-16 sm:p-18 ${hasLines ? 'pb-28 md:pb-18' : ''}`}>
              <div className="grid grid-cols-2 gap-12 sm:grid-cols-3 lg:grid-cols-4">
                {visibleItems.map((item) => {
                  const snapshot = item.toSnapshot();
                  const inCart = liveLines
                    .filter((line) => line.itemId === item.id)
                    .reduce((sum, line) => sum + line.qty, 0);
                  return (
                    <MenuItemCard
                      key={item.id}
                      name={snapshot.nameAr}
                      sub={snapshot.descriptionAr}
                      price={i18n.money(snapshot.priceMinor)}
                      available={item.isAvailable()}
                      flag={item.isAvailable() ? undefined : i18n.t('pos.menu.unavailable')}
                      inCart={inCart > 0 ? i18n.int(inCart) : undefined}
                      onClick={() => pos.addItem(item.id)}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop cart — the fixed end panel, tablet and up. */}
      <aside className="hidden w-cart flex-none flex-col border-s border-line bg-surface md:flex">
        {cartContents}
      </aside>

      {/* Mobile cart summary bar — fixed just above the bottom nav, only with
          items in the cart. Tapping it opens the full sheet. */}
      {hasLines && order ? (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-0 bottom-mobile-nav z-30 flex h-16 items-center justify-between gap-12 border-t border-line bg-surface px-16 text-start md:hidden"
        >
          <span className="flex items-center gap-8 text-ar-base font-medium">
            <span className="relative">
              <ShoppingCart size={22} />
              <span className="absolute -end-2 -top-2 flex min-w-badge items-center justify-center rounded-full bg-accent px-1 text-num-xs text-text-on-accent">
                {i18n.int(liveLines.reduce((sum, line) => sum + line.qty, 0))}
              </span>
            </span>
            {i18n.t('pos.cart.review')}
          </span>
          <Numeric className="text-num-lg font-semibold">{i18n.money(order.total())}</Numeric>
        </button>
      ) : null}

      {/* Mobile cart sheet — the full cart as a bottom overlay. */}
      {cartOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" dir={i18n.dir}>
          <button
            type="button"
            aria-label={i18n.t('pos.cart.close')}
            onClick={() => setCartOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-xl border-t border-line bg-surface">
            <div className="flex flex-none items-center justify-between px-14 pt-12">
              <span className="text-ar-lg font-semibold">{i18n.t('pos.cart.review')}</span>
              <button type="button" onClick={() => setCartOpen(false)} aria-label={i18n.t('pos.cart.close')}>
                <X size={24} className="text-text-muted" />
              </button>
            </div>
            {cartContents}
          </div>
        </div>
      ) : null}

      {noteOpen && order ? (
        <NoteSheet
          lines={liveLines.map((line) => ({ id: line.id, name: line.nameAr, note: line.modifiersText }))}
          onSave={pos.noteLine}
          onClose={() => setNoteOpen(false)}
        />
      ) : null}

      {discountOpen && order ? (
        <DiscountSheet
          currentMinor={order.toSnapshot().discountMinor}
          subtotalMinor={order.subtotal()}
          onApply={pos.applyDiscount}
          onClose={() => setDiscountOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * The discount sheet.
 *
 * The entity has enforced the two rules all along — not negative, not more than
 * the bill — and refused with a code. Nothing ever called it, so the button sat
 * there doing nothing. Here the refusal is shown in the cashier's language
 * instead of being thrown into the console.
 */
function DiscountSheet({
  currentMinor,
  subtotalMinor,
  onApply,
  onClose,
}: {
  currentMinor: bigint;
  subtotalMinor: bigint;
  onApply: (amountMinor: bigint) => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const [raw, setRaw] = useState(currentMinor > 0n ? currentMinor.toString() : '');
  const [error, setError] = useState<string | null>(null);

  const submit = (amountMinor: bigint) => {
    setError(null);
    try {
      onApply(amountMinor);
      onClose();
    } catch (caught) {
      const code = caught instanceof DomainError ? `error.${caught.code}` : 'error.unknown';
      setError(i18n.t(code as Parameters<typeof i18n.t>[0]));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir={i18n.dir}>
      <button type="button" aria-label={i18n.t('common.back')} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative flex w-full max-w-md flex-col gap-14 rounded-t-2xl border border-line bg-surface p-18 sm:rounded-2xl">
        <span className="text-ar-lg font-semibold">{i18n.t('pos.discount.title')}</span>

        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('pos.discount.amount')}
          <TextField
            value={raw}
            onChange={(event) => setRaw(event.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            dir="ltr"
            autoFocus
          />
        </label>

        <div className="flex items-baseline justify-between text-ar-sm text-text-muted">
          <span>{i18n.t('pos.cart.subtotal')}</span>
          <Numeric className="text-num-base">{i18n.money(subtotalMinor)}</Numeric>
        </div>

        {error ? (
          <span role="status" aria-live="polite" className="text-ar-sm text-danger">
            {error}
          </span>
        ) : null}

        <div className="grid grid-cols-2 gap-10">
          <Button variant="secondary" size="lg" onClick={() => submit(0n)} disabled={currentMinor === 0n}>
            {i18n.t('pos.discount.clear')}
          </Button>
          <Button variant="primary" size="lg" onClick={() => submit(BigInt(raw || '0'))}>
            {i18n.t('pos.discount.apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * A cook's note on one line — "بدون شطة", "نص استواء". The last line rung up is
 * picked by default, because that is almost always the one being described.
 * Refused, with the reason shown, once the kitchen already has the ticket.
 */
function NoteSheet({
  lines,
  onSave,
  onClose,
}: {
  lines: { id: string; name: string; note: string }[];
  onSave: (lineId: string, note: string) => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const [lineId, setLineId] = useState(lines[lines.length - 1]?.id ?? '');
  const [note, setNote] = useState(lines[lines.length - 1]?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const pick = (id: string) => {
    setLineId(id);
    setNote(lines.find((line) => line.id === id)?.note ?? '');
    setError(null);
  };

  const save = () => {
    try {
      onSave(lineId, note);
      onClose();
    } catch (caught) {
      const code = caught instanceof DomainError ? `error.${caught.code}` : 'error.unknown';
      setError(i18n.t(code as Parameters<typeof i18n.t>[0]));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir={i18n.dir}>
      <button type="button" aria-label={i18n.t('common.back')} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n.t('pos.note.title')}
        className="relative flex max-h-[85vh] w-full max-w-md flex-col gap-14 rounded-t-2xl border border-line bg-surface p-18 sm:rounded-2xl"
      >
        <span className="text-ar-lg font-semibold">{i18n.t('pos.note.title')}</span>
        <div role="radiogroup" aria-label={i18n.t('pos.note.line')} className="flex min-h-0 flex-col gap-6 overflow-y-auto">
          {lines.map((line) => (
            <button
              key={line.id}
              type="button"
              role="radio"
              aria-checked={line.id === lineId}
              onClick={() => pick(line.id)}
              className={
                line.id === lineId
                  ? 'flex min-h-control-lg items-center justify-between gap-10 rounded-md border-strong border-accent bg-accent-tint px-14 text-start text-ar-base font-medium'
                  : 'flex min-h-control-lg items-center justify-between gap-10 rounded-md border border-line bg-surface-2 px-14 text-start text-ar-base'
              }
            >
              <span className="truncate">{line.name}</span>
              {line.note ? <span className="truncate text-ar-sm text-text-muted">{line.note}</span> : null}
            </button>
          ))}
        </div>
        <TextField
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={i18n.t('pos.note.placeholder')}
          aria-label={i18n.t('pos.note.title')}
          maxLength={240}
          autoFocus
        />
        {error ? (
          <span role="status" aria-live="polite" className="text-ar-sm text-danger">
            {error}
          </span>
        ) : null}
        <div className="grid grid-cols-2 gap-10">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {i18n.t('common.cancel')}
          </Button>
          <Button variant="primary" size="lg" onClick={save} disabled={!lineId}>
            {i18n.t('pos.note.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
