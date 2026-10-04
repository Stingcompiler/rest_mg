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
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { Minus, Plus, ShoppingBag, Trash2, X, CheckCircle2, Loader2 } from 'lucide-react';

import { formatInteger, formatMoney, t } from '@/i18n';
import { IconButton } from '@/components/primitives/controls';
import { normalizeSudanPhone } from '@/lib/phone';
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

export function CartProvider({
  children,
  ordering,
  slug,
}: {
  children: React.ReactNode;
  ordering: boolean;
  slug?: string;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const api = useMemo<CartApi>(() => {
    const count = lines.reduce((sum, l) => sum + l.qty, 0);
    const subtotalMinor = lines.reduce((sum, l) => sum + BigInt(l.item.price_minor) * BigInt(l.qty), 0n);
    return {
      ordering,
      slug,
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
        setSheetOpen(true);
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
  }, [lines, ordering, slug]);

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
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-6xl items-center justify-between gap-12 border-t border-line bg-accent px-16 py-12 text-text-on-accent shadow-overlay sm:bottom-4 sm:rounded-full sm:border-0"
    >
      <span className="flex items-center gap-8 text-ar-md font-semibold">
        <span className="relative">
          <ShoppingBag size={22} />
          <span className="absolute -end-2 -top-2 flex min-w-badge items-center justify-center rounded-full bg-bg px-4 text-num-xs text-text">
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
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
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
            onBack={() => setStep('cart')}
            onDone={(number) => {
              setOrderNumber(number);
              setStep('done');
              cart.clear();
            }}
          />
        ) : (
          <DoneStep orderNumber={orderNumber} onClose={onClose} />
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
              <div className="h-[3.25rem] w-[3.25rem] flex-none overflow-hidden rounded-md bg-surface-2">
                {item.image_url ? <img src={item.image_url} alt={item.name_ar} className="h-full w-full object-cover" /> : null}
              </div>
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

function FormStep({ onBack, onDone }: { onBack: () => void; onDone: (orderNumber: string) => void }) {
  const cart = useCart();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // One key per checkout attempt, kept across retries of the same attempt: a
  // submit that timed out after the order was placed, sent again, finds that
  // order instead of placing a second. A new visit to the form is a new attempt.
  const [attempt] = useState(uuid4);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setError(label('landing.form.required'));
      return;
    }
    // A number the restaurant can call: every order is confirmed by phone
    // before the kitchen sees it. "123" used to go through.
    const dialable = normalizeSudanPhone(phone);
    if (!dialable) {
      setError(label('landing.form.phoneInvalid'));
      return;
    }
    setSending(true);
    try {
      const response = await fetch('/api/v1/public/order/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: dialable,
          customer_address: address.trim(),
          customer_area: area.trim(),
          customer_notes: notes.trim(),
          ...(cart.slug ? { slug: cart.slug } : {}),
          items: cart.lines.map((l) => ({ item_id: l.item.id, qty: l.qty })),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        // Ordering closed since the page loaded: say so and keep the cart.
        const closed = body?.error?.code === 'online_ordering_closed';
        setError(
          closed
            ? label('landing.order.closed')
            : body?.error?.code === 'invalid_phone'
              ? label('landing.form.phoneInvalid')
            : response.status === 429
              ? label('landing.order.tooMany')
              : response.status === 409
                ? label('landing.order.unavailable')
                : label('landing.order.error'),
        );
        setSending(false);
        return;
      }
      onDone(String(body.number));
    } catch {
      setError(label('landing.order.error'));
      setSending(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-16">
      <div className="flex flex-col gap-12">
        <Field label={label('landing.form.name')}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={label('landing.form.phone')}>
          <input
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
            placeholder="09xxxxxxxx"
            aria-describedby="phone-hint"
          />
          <span id="phone-hint" className="text-ar-sm text-text-muted">
            {label('landing.form.phoneHint')}
          </span>
        </Field>
        <Field label={label('landing.form.address')}>
          <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label={label('landing.form.area')}>
          <input className={inputClass} value={area} onChange={(e) => setArea(e.target.value)} />
        </Field>
        <Field label={label('landing.form.notes')}>
          <textarea className={`${inputClass} py-10`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        <div className="flex items-center justify-between rounded-lg bg-surface-2 p-12 text-ar-base font-semibold">
          <span>{label('landing.cart.total')}</span>
          <span className="numeric text-accent">{money(cart.subtotalMinor)}</span>
        </div>

        {error ? <span className="text-ar-sm text-danger">{error}</span> : null}

        <div className="flex gap-10">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending}
            className="inline-flex min-h-control-xl flex-1 items-center justify-center gap-8 rounded-full bg-accent text-ar-md font-semibold text-text-on-accent transition hover:opacity-90 disabled:opacity-60"
          >
            {sending ? <Loader2 size={20} className="animate-spin" /> : <ShoppingBag size={20} />}
            {sending ? label('landing.form.sending') : label('landing.form.submit')}
          </button>
          <button type="button" onClick={onBack} disabled={sending} className="inline-flex min-h-control-xl items-center justify-center rounded-full border border-line px-18 text-ar-sm text-text-muted">
            {label('landing.form.back')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DoneStep({ orderNumber, onClose }: { orderNumber: string | null; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-16 p-32 text-center">
      <CheckCircle2 size={64} className="text-success" />
      <h3 className="text-ar-2xl font-bold">{label('landing.confirm.title')} 🎉</h3>
      {orderNumber ? (
        <div className="flex flex-col items-center gap-4">
          <span className="text-ar-sm text-text-muted">{label('landing.confirm.orderNumber')}</span>
          <span className="numeric text-num-2xl font-bold text-accent" dir="ltr">#{orderNumber}</span>
        </div>
      ) : null}
      <p className="text-ar-base text-text-muted">{label('landing.confirm.message')}</p>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-control-xl items-center justify-center rounded-full bg-accent px-24 text-ar-md font-semibold text-text-on-accent"
      >
        {label('landing.confirm.close')}
      </button>
    </div>
  );
}
