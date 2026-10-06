'use client';

/**
 * The visitor's ordering experience — cart, delivery form, confirmation.
 *
 * This is the customer half of the platform: a shopping cart held in the page,
 * a delivery form, and a submit to the same public endpoint that prices the
 * order server-side and drops it onto the till and the kitchen board. The cart
 * carries only item ids and quantities to the server; the price shown here is
 * the same `price_minor` the menu came with, but the server re-derives the total
 * it charges, so the number on the confirmation is the server's, not ours.
 *
 * Arabic-first, RTL, Mobile-first: a floating bar summarises the cart and opens
 * a full sheet, which walks cart → form → confirmation in place.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, ShoppingBag, Trash2, X, CheckCircle2, Loader2 } from 'lucide-react';

import { formatInteger, formatMoney, t } from '@/i18n';
import { IconButton } from '@/components/primitives/controls';
import { normalizeSudanPhone } from '@/lib/phone';
import { browserStorage } from './browserStorage';
import { loadCart, saveCart } from './cartStore';
import { rememberOrder } from './lastOrder';
import { validateOrderForm, type Fulfilment, type OrderField } from './orderForm';
import { uuid4 } from '@/lib/uuid';
import { useModalDialog } from '@/lib/useModalDialog';

const LOCALE = 'ar' as const;
const NUMERALS = 'arabic-indic' as const;
const label = (key: Parameters<typeof t>[0], params?: Record<string, string | number>) =>
  t(key, LOCALE, params);
const money = (minor: bigint) => formatMoney(minor, NUMERALS);
const int = (n: number) => formatInteger(n, NUMERALS);

export interface OrderableItem {
  id: string;
  name_ar: string;
  price_minor: string;
  image_url: string | null;
  is_available: boolean;
}

interface CartLine {
  item: OrderableItem;
  qty: number;
}

interface CartApi {
  /** Whether the restaurant takes orders from the page right now. When it does
   *  not, nothing can be added and the cart never shows. */
  ordering: boolean;
  /** The restaurant the order is for, when the page knows it. */
  slug?: string;
  /** Where a pickup is collected from: the restaurant's address. */
  pickupAddress?: string;
  lines: CartLine[];
  count: number;
  subtotalMinor: bigint;
  add(item: OrderableItem): void;
  setQty(id: string, qty: number): void;
  remove(id: string): void;
  clear(): void;
  open(): void;
}

const CartContext = createContext<CartApi | null>(null);

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}

/** Fired when an order is placed, so the page's status card can show it. */
export const ORDER_PLACED_EVENT = 'sp-order-placed';

export function CartProvider({
  children,
  ordering,
  slug,
  menu,
  pickupAddress,
}: {
  children: React.ReactNode;
  ordering: boolean;
  slug?: string;
  pickupAddress?: string;
  /** Every dish on the page, to rebuild a saved cart from (batch 14). */
  menu?: OrderableItem[];
}) {
  const storeKey = slug ?? '_';
  // A reload used to empty the cart. It is rebuilt from the menu as it is now.
  const [lines, setLines] = useState<CartLine[]>(() =>
    ordering && menu ? loadCart(browserStorage(), storeKey, menu) : [],
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (ordering) saveCart(browserStorage(), storeKey, lines);
  }, [lines, ordering, storeKey]);

  const api = useMemo<CartApi>(() => {
    const count = lines.reduce((sum, l) => sum + l.qty, 0);
    const subtotalMinor = lines.reduce((sum, l) => sum + BigInt(l.item.price_minor) * BigInt(l.qty), 0n);
    return {
      ordering,
      slug,
      pickupAddress,
      lines,
      count,
      subtotalMinor,
      add(item) {
        if (!ordering) return;
        setLines((cur) => {
          const found = cur.find((l) => l.item.id === item.id);
          if (found) return cur.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l));
          return [...cur, { item, qty: 1 }];
        });
        // The cart stays closed: the dish's own counter and the bar at the
        // bottom show it was added. Opening the whole sheet on every tap hid
        // the menu the visitor was still choosing from (batch 19).
      },
      setQty(id, qty) {
        setLines((cur) =>
          qty <= 0 ? cur.filter((l) => l.item.id !== id) : cur.map((l) => (l.item.id === id ? { ...l, qty } : l)),
        );
      },
      remove(id) {
        setLines((cur) => cur.filter((l) => l.item.id !== id));
      },
      clear() {
        setLines([]);
      },
      open() {
        setSheetOpen(true);
      },
    };
  }, [lines, ordering, slug, pickupAddress]);

  return (
    <CartContext.Provider value={api}>
      {children}
      {ordering ? <CartBar onOpen={() => setSheetOpen(true)} /> : null}
      {ordering && sheetOpen ? <OrderSheet onClose={() => setSheetOpen(false)} /> : null}
    </CartContext.Provider>
  );
}

/** The floating summary bar — appears only with something in the cart. */
function CartBar({ onOpen }: { onOpen: () => void }) {
  const cart = useCart();
  if (cart.count === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      dir="rtl"
      // Ink with a gold edge, like the page's footer (batch 13).
      // Slides in the first time something is added (batch 28).
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-6xl animate-slide-up items-center justify-between gap-12 border-t border-gold-soft bg-ink px-16 py-12 text-on-ink shadow-overlay sm:bottom-4 sm:rounded-md sm:border"
    >
      <span className="flex items-center gap-8 text-ar-md font-semibold">
        <span className="relative">
          <ShoppingBag size={22} />
          <span className="absolute -end-2 -top-2 flex min-w-badge items-center justify-center rounded-full bg-gold-soft px-4 text-num-xs text-ink">
            {int(cart.count)}
          </span>
        </span>
        {label('landing.cart.view')}
      </span>
      <span className="numeric text-num-lg font-bold">{money(cart.subtotalMinor)}</span>
    </button>
  );
}

type Step = 'cart' | 'form' | 'done';

function OrderSheet({ onClose }: { onClose: () => void }) {
  const cart = useCart();
  const [step, setStep] = useState<Step>('cart');
  const [placed, setPlaced] = useState<PlacedSummary | null>(null);
  // Kept here, not in the form: going back to the cart used to clear it.
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const dialog = useRef<HTMLDivElement>(null);
  useModalDialog(dialog, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir="rtl" lang="ar">
      <button type="button" tabIndex={-1} aria-label={label('landing.confirm.close')} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-sheet-title"
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-line bg-surface text-text sm:rounded-xl"
      >
        <div className="flex flex-none items-center justify-between border-b border-line px-16 py-12">
          <span id="order-sheet-title" className="text-ar-lg font-bold">
            {step === 'done' ? label('landing.confirm.title') : step === 'form' ? label('landing.form.title') : label('landing.cart.title')}
          </span>
          <IconButton variant="quiet" label={label('landing.confirm.close')} onClick={onClose}>
            <X size={22} />
          </IconButton>
        </div>

        {step === 'cart' ? (
          <CartStep onCheckout={() => setStep('form')} />
        ) : step === 'form' ? (
          <FormStep
            draft={draft}
            onDraft={setDraft}
            onBack={() => setStep('cart')}
            onDone={(summary) => {
              setPlaced(summary);
              setStep('done');
              setDraft(EMPTY_DRAFT);
              cart.clear();
            }}
          />
        ) : (
          <DoneStep placed={placed} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function CartStep({ onCheckout }: { onCheckout: () => void }) {
  const cart = useCart();
  if (cart.lines.length === 0) {
    return <div className="p-24 text-center text-ar-base text-text-muted">{label('landing.cart.empty')}</div>;
  }
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-16">
        <div className="flex flex-col gap-10">
          {cart.lines.map(({ item, qty }) => (
            <div key={item.id} className="flex items-center gap-12 rounded-lg border border-line bg-bg p-10">
              {/* A photo when there is one, and no empty box when there is not
                  (batch 19). */}
              {item.image_url ? (
                <div className="h-[3.25rem] w-[3.25rem] flex-none overflow-hidden rounded-md bg-surface-2">
                  <img src={item.image_url} alt={item.name_ar} className="h-full w-full object-cover" />
                </div>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Two lines, not an ellipsis: the steppers are thumb-sized now and
                    leave a phone little width for the name. */}
                <span className="line-clamp-2 text-ar-base font-medium leading-snug">{item.name_ar}</span>
                <span className="numeric text-num-sm text-text-muted">{money(BigInt(item.price_minor))}</span>
              </div>
              <div className="flex flex-none items-center gap-4">
                <IconButton
                  label={label('pos.cart.qtyLess', { name: item.name_ar })}
                  onClick={() => cart.setQty(item.id, qty - 1)}
                  className="rounded-full"
                >
                  <Minus size={16} />
                </IconButton>
                <span className="numeric min-w-icon-lg text-center text-num-base font-semibold">{int(qty)}</span>
                <IconButton
                  label={label('pos.cart.qtyMore', { name: item.name_ar })}
                  onClick={() => cart.setQty(item.id, qty + 1)}
                  className="rounded-full"
                >
                  <Plus size={16} />
                </IconButton>
                <IconButton
                  variant="quiet"
                  label={label('landing.cart.remove')}
                  onClick={() => cart.remove(item.id)}
                  className="text-danger"
                >
                  <Trash2 size={18} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-none flex-col gap-12 border-t border-line bg-surface-2 p-16">
        <div className="flex items-center justify-between text-ar-lg font-bold">
          <span>{label('landing.cart.total')}</span>
          <span className="numeric text-accent">{money(cart.subtotalMinor)}</span>
        </div>
        <button
          type="button"
          onClick={onCheckout}
          className="inline-flex min-h-control-xl items-center justify-center gap-8 rounded-full bg-accent text-ar-md font-semibold text-text-on-accent transition hover:opacity-90"
        >
          <ShoppingBag size={20} />
          {label('landing.cart.checkout')}
        </button>
      </div>
    </>
  );
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
      {text}
      {children}
    </label>
  );
}

const inputClass =
  'min-h-control-lg rounded-md border border-line bg-bg px-14 text-ar-base text-text outline-none focus-visible:border-accent';

interface Draft {
  /** Delivered to an address, or collected at the counter (batch 16). */
  fulfilment: Fulfilment;
  name: string;
  phone: string;
  address: string;
  area: string;
  notes: string;
}

const EMPTY_DRAFT: Draft = { fulfilment: 'delivery', name: '', phone: '', address: '', area: '', notes: '' };

interface PlacedSummary {
  number: string;
  totalMinor: bigint;
  phone: string;
  fulfilment: Fulfilment;
}

function FormStep({
  draft,
  onDraft,
  onBack,
  onDone,
}: {
  draft: Draft;
  onDraft: (draft: Draft) => void;
  onBack: () => void;
  onDone: (summary: PlacedSummary) => void;
}) {
  const cart = useCart();
  const set = (field: keyof Draft) => (value: string) => onDraft({ ...draft, [field]: value });
  // One message per field, next to it, and focus on the first one to fix. A
  // single sentence used to cover every field (batch 14).
  const [problems, setProblems] = useState<Partial<Record<OrderField, string>>>({});
  const fields = { name: useRef<HTMLInputElement>(null), phone: useRef<HTMLInputElement>(null), address: useRef<HTMLInputElement>(null) };
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // One key per checkout attempt, kept across retries of the same attempt: a
  // submit that timed out after the order was placed, sent again, finds that
  // order instead of placing a second. A new visit to the form is a new attempt.
  const [attempt] = useState(uuid4);

  const submit = async () => {
    setError(null);
    const found = validateOrderForm(draft, draft.fulfilment);
    setProblems(Object.fromEntries(found.map((problem) => [problem.field, label(problem.key)])));
    if (found.length > 0) {
      fields[found[0]!.field].current?.focus();
      return;
    }
    // A number the restaurant can call: every order is confirmed by phone
    // before the kitchen sees it. "123" used to go through.
    const dialable = normalizeSudanPhone(draft.phone)!;
    setSending(true);
    try {
      const response = await fetch('/api/v1/public/order/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt },
        body: JSON.stringify({
          customer_name: draft.name.trim(),
          customer_phone: dialable,
          fulfilment: draft.fulfilment,
          customer_address: draft.fulfilment === 'pickup' ? '' : draft.address.trim(),
          customer_area: draft.fulfilment === 'pickup' ? '' : draft.area.trim(),
          customer_notes: draft.notes.trim(),
          ...(cart.slug ? { slug: cart.slug } : {}),
          items: cart.lines.map((l) => ({ item_id: l.item.id, qty: l.qty })),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body?.error?.code;
        if (code === 'invalid_phone') {
          setProblems({ phone: label('landing.form.phoneInvalid') });
          fields.phone.current?.focus();
        } else {
          // Ordering closed since the page loaded: say so and keep the cart.
          setError(
            code === 'online_ordering_closed'
              ? label('landing.order.closed')
              : response.status === 429
                ? label('landing.order.tooMany')
                : response.status === 409
                  ? label('landing.order.unavailable')
                  : label('landing.order.error'),
          );
        }
        setSending(false);
        return;
      }
      // Kept, so the page can show how the order stands after this closes.
      rememberOrder(browserStorage(), cart.slug ?? '_', {
        id: String(body.id),
        number: String(body.number),
        placedAt: Date.now(),
      });
      window.dispatchEvent(new Event(ORDER_PLACED_EVENT));
      onDone({
        number: String(body.number),
        totalMinor: BigInt(body.total_minor ?? cart.subtotalMinor),
        phone: dialable,
        fulfilment: draft.fulfilment,
      });
    } catch {
      setError(label('landing.order.error'));
      setSending(false);
    }
  };

  const invalid = (field: OrderField) =>
    problems[field]
      ? { 'aria-invalid': true as const, 'aria-describedby': `${field}-error` }
      : { 'aria-invalid': false as const };
  const problem = (field: OrderField) =>
    problems[field] ? (
      <span id={`${field}-error`} role="alert" className="text-ar-sm text-danger-text">
        {problems[field]}
      </span>
    ) : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-16">
      <div className="flex flex-col gap-12">
        <div role="radiogroup" aria-label={label('landing.form.fulfilment')} className="grid grid-cols-2 gap-8">
          {(['delivery', 'pickup'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={draft.fulfilment === option}
              onClick={() => onDraft({ ...draft, fulfilment: option })}
              className={
                draft.fulfilment === option
                  ? 'min-h-control-lg rounded-md bg-ink text-ar-base font-semibold text-on-ink'
                  : 'min-h-control-lg rounded-md border border-line text-ar-base text-text-muted hover:border-gold-soft'
              }
            >
              {label(option === 'pickup' ? 'landing.form.pickup' : 'landing.form.delivery')}
            </button>
          ))}
        </div>
        <Field label={label('landing.form.name')}>
          <input
            ref={fields.name}
            className={inputClass}
            value={draft.name}
            onChange={(e) => set('name')(e.target.value)}
            autoComplete="name"
            {...invalid('name')}
          />
          {problem('name')}
        </Field>
        <Field label={label('landing.form.phone')}>
          <input
            ref={fields.phone}
            className={inputClass}
            value={draft.phone}
            onChange={(e) => set('phone')(e.target.value)}
            inputMode="tel"
            type="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="09xxxxxxxx"
            aria-invalid={Boolean(problems.phone)}
            aria-describedby={problems.phone ? 'phone-error phone-hint' : 'phone-hint'}
          />
          {problem('phone')}
          <span id="phone-hint" className="text-ar-sm text-text-muted">
            {label('landing.form.phoneHint')}
          </span>
        </Field>
        {draft.fulfilment === 'delivery' ? (
          <>
        <Field label={label('landing.form.address')}>
          <input
            ref={fields.address}
            className={inputClass}
            value={draft.address}
            onChange={(e) => set('address')(e.target.value)}
            autoComplete="street-address"
            {...invalid('address')}
          />
          {problem('address')}
        </Field>
        <Field label={label('landing.form.area')}>
          <input
            className={inputClass}
            value={draft.area}
            onChange={(e) => set('area')(e.target.value)}
            autoComplete="address-level2"
          />
        </Field>
          </>
        ) : cart.pickupAddress ? (
          <p className="rounded-md border border-line p-12 text-ar-sm text-text-muted">
            {label('landing.confirm.pickupAt', { address: cart.pickupAddress })}
          </p>
        ) : null}
        <Field label={label('landing.form.notes')}>
          <textarea className={`${inputClass} py-10`} value={draft.notes} onChange={(e) => set('notes')(e.target.value)} rows={2} />
        </Field>

        <div className="flex flex-col gap-6 rounded-md bg-surface-2 p-12">
          <div className="flex items-center justify-between text-ar-base font-semibold">
            <span>{label('landing.cart.total')}</span>
            <span className="numeric text-gold">{money(cart.subtotalMinor)}</span>
          </div>
          <span className="text-ar-sm text-text-muted">
            {label(draft.fulfilment === 'pickup' ? 'landing.form.payAtCounter' : 'landing.form.payOnDelivery')}
          </span>
        </div>

        {error ? (
          <span role="alert" className="text-ar-sm text-danger-text">
            {error}
          </span>
        ) : null}

        <div className="flex gap-10">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending}
            className="inline-flex min-h-control-xl flex-1 items-center justify-center gap-8 rounded-md bg-accent text-ar-md font-semibold text-text-on-accent transition hover:bg-accent-hover disabled:opacity-60"
          >
            {sending ? <Loader2 size={20} className="animate-spin" /> : <ShoppingBag size={20} />}
            {sending ? label('landing.form.sending') : label('landing.form.submit')}
          </button>
          <button type="button" onClick={onBack} disabled={sending} className="inline-flex min-h-control-xl items-center justify-center rounded-md border border-line px-18 text-ar-sm text-text-muted">
            {label('landing.form.back')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * After ordering: the number, the total, who calls whom, and where to look
 * next. It used to show the number and "we'll contact you", and closing it
 * lost the number (batch 14).
 */
function DoneStep({ placed, onClose }: { placed: PlacedSummary | null; onClose: () => void }) {
  const cart = useCart();
  return (
    <div className="flex flex-col items-center gap-16 p-32 text-center">
      <CheckCircle2 size={56} className="text-success" />
      <h3 className="font-display text-ar-2xl font-semibold">{label('landing.confirm.title')}</h3>
      {placed ? (
        <div className="flex w-full flex-col gap-8 rounded-md border border-line bg-bg p-16">
          <div className="flex items-baseline justify-between">
            <span className="text-ar-sm text-text-muted">{label('landing.confirm.orderNumber')}</span>
            <span className="numeric text-num-xl font-semibold" dir="ltr">#{placed.number}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-ar-sm text-text-muted">{label('landing.confirm.total')}</span>
            <span className="numeric text-num-lg font-semibold text-gold">{money(placed.totalMinor)}</span>
          </div>
        </div>
      ) : null}
      <p className="text-ar-base text-text-muted">
        {placed ? label('landing.confirm.callYou', { phone: placed.phone }) : label('landing.confirm.message')}
      </p>
      {placed?.fulfilment === 'pickup' && cart.pickupAddress ? (
        <p className="text-ar-base font-medium">{label('landing.confirm.pickupAt', { address: cart.pickupAddress })}</p>
      ) : null}
      <p className="text-ar-sm text-text-muted">{label('landing.confirm.track')}</p>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-control-xl items-center justify-center rounded-md bg-accent px-24 text-ar-md font-semibold text-text-on-accent"
      >
        {label('landing.confirm.close')}
      </button>
    </div>
  );

}
