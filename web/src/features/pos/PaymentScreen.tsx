'use client';

/**
 * Payment. Method cards + quick cash + keypad on the start side; the running
 * bill on the end side. Split payments accumulate toward the total; the close is
 * disabled until the balance is covered, exactly as the design draws it.
 *
 * Cash is one tap. Credit asks who owes it. Bank and wallet ask for the
 * transaction reference on the customer's confirmation — the till used to make
 * one up from the clock, so a recorded transfer could never be matched to a real
 * one (review finding F08). Recording stays manual: nothing here checks with a
 * bank, and the dialog says so.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Banknote, CheckCircle2, Landmark, Printer, Smartphone, Clock3 } from 'lucide-react';

import {
  AmountRow,
  TextField,
  Button,
  CalloutPanel,
  IconButton,
  Keypad,
  Numeric,
  PaymentMethodCard,
  ProgressBar,
  QuickCashButton,
  StatusChip,
} from '@/components';
import { AppHeader } from '@/components/layout/layout';
import { Divider } from '@/components/primitives/indicators';
import { customerRepository, type CustomerRecord } from '@/db';
import { formatTime, useI18n } from '@/i18n';
import { buildPrintContext, printReceiptToPaper } from '@/print';
import { DomainError, WALK_IN_CUSTOMER_ID, type PaymentMethod } from '@/domain';
import { usePos } from './PosProvider';
import { MAX_REFERENCE_LENGTH, cleanReference, isUsableReference } from './paymentReference';

const QUICK_CASH = [5_000n, 10_000n, 20_000n];

const METHOD_LABEL_KEY = {
  cash: 'pos.payment.cash',
  bank: 'pos.payment.bank',
  wallet: 'pos.payment.wallet',
  credit: 'pos.payment.credit',
} as const;

export function PaymentScreen() {
  const pos = usePos();
  const i18n = useI18n();
  const router = useRouter();
  const [entered, setEntered] = useState('');
  // What just happened, shown to the cashier. A payment that is refused by a
  // domain rule used to fail silently into the console; a payment that worked
  // gave no acknowledgement either.
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  // Choosing who owes a credit sale. The names come from IndexedDB, filled by
  // the same pull that brings the menu, so this works with the line down.
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  // A transfer or wallet payment waiting for its reference.
  const [referenceFor, setReferenceFor] = useState<'bank' | 'wallet' | null>(null);

  useEffect(() => {
    void customerRepository.list().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  const order = pos.activeOrder;

  // Arriving from the deliveries screen to collect a website order: open that
  // bill. Read once the till has loaded its open bills from storage.
  const { ready, cart, resumeOrder } = pos;
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const wanted = new URLSearchParams(window.location.search).get('order');
    if (wanted && cart.active()?.id !== wanted && cart.list().some((bill) => bill.id === wanted)) {
      resumeOrder(wanted);
    }
  }, [ready, cart, resumeOrder]);

  // The face of each key follows the numerals setting; the value behind it is
  // always the western digit the maths uses. The keypad used to hardcode
  // Arabic-Indic glyphs, so switching to western numerals left it unchanged.
  const keys = useMemo(
    () =>
      ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '000', 'back'].map((value) => ({
        label:
          value === 'back' ? '⌫' : value === '000' ? `${i18n.int(0)}${i18n.int(0)}${i18n.int(0)}` : i18n.int(Number(value)),
        value,
      })),
    [i18n],
  );

  if (!order) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-text">
        <span className="text-ar-lg text-text-muted">{i18n.t('pos.orders.empty')}</span>
      </div>
    );
  }

  const enteredMinor = BigInt(entered || '0');
  const due = order.amountDue();
  const total = order.total();
  const paid = order.amountPaid();
  const paidPercent = total > 0n ? Number((paid * 100n) / total) : 100;
  const payments = order.toSnapshot().payments;
  // What a method tap charges right now: the typed amount, capped at the
  // balance, or the whole balance when nothing has been typed.
  const chargeAmount = enteredMinor > 0n ? (enteredMinor > due ? due : enteredMinor) : due;

  const press = (value: string) => {
    if (value === 'back') setEntered((current) => current.slice(0, -1));
    else setEntered((current) => (current + value).replace(/^0+(?=\d)/, ''));
  };

  // A domain rule violation carries a stable code; the catalogue turns it into a
  // sentence in the cashier's language. Anything else is reported generically
  // rather than swallowed.
  const describe = (error: unknown): string => {
    const code = error instanceof DomainError ? `error.${error.code}` : 'error.unknown';
    return i18n.t(code as Parameters<typeof i18n.t>[0]);
  };

  // Credit is money owed, so it has to be owed *by someone*. Tapping it opens
  // the picker rather than booking the debt to nobody in particular; the actual
  // payment is recorded once a name is chosen.
  const pay = (method: PaymentMethod) => {
    if (method === 'credit' && due > 0n) {
      setPickingCustomer(true);
      return;
    }
    if ((method === 'bank' || method === 'wallet') && due > 0n) {
      setReferenceFor(method);
      return;
    }
    payWith(method);
  };

  const payWith = (method: PaymentMethod, customerId: string = WALK_IN_CUSTOMER_ID, reference = '') => {
    if (due <= 0n) {
      // Nothing left to take. Saying "invalid amount" here was technically true
      // and completely unhelpful — the bill is simply already paid.
      setFeedback({ tone: 'ok', text: i18n.t('pos.payment.settledAlready') });
      return;
    }
    const amount = enteredMinor > 0n ? (enteredMinor > due ? due : enteredMinor) : due;
    if (amount <= 0n) {
      setFeedback({ tone: 'error', text: i18n.t('error.payment_invalid') });
      return;
    }
    try {
      if (method === 'cash') {
        const tendered = enteredMinor > 0n ? enteredMinor : due;
        pos.addPayment({ method, amountMinor: amount, tenderedMinor: tendered });
      } else if (method === 'credit') {
        // Handled by the picker; see `payCredit`.
        pos.addPayment({ method, amountMinor: amount, customerId });
      } else {
        pos.addPayment({ method, amountMinor: amount, reference: cleanReference(reference) });
      }
      setEntered('');
      // Read the balance *after* the payment landed, so the message tells the
      // cashier what to do next rather than what was true a moment ago.
      const stillDue = order.amountDue();
      setFeedback({
        tone: 'ok',
        text:
          stillDue <= 0n
            ? i18n.t('pos.payment.settled')
            : i18n.t('pos.payment.added', {
                method: i18n.t(METHOD_LABEL_KEY[method]),
                amount: i18n.money(amount),
              }),
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: describe(error) });
    }
  };

  // Paper in the customer's hand, now — without waiting for the bill to close
  // and without leaving the screen. Closing already queues a thermal receipt;
  // this is the copy a browser can actually produce, on demand.
  const printNow = () => {
    const opened = printReceiptToPaper(
      order,
      buildPrintContext(i18n.locale, i18n.numerals),
      `${i18n.t('print.order')} ${order.toSnapshot().number}`,
    );
    setFeedback({
      tone: opened ? 'ok' : 'error',
      text: i18n.t(opened ? 'pos.payment.printed' : 'pos.payment.printBlocked'),
    });
  };

  const closeBill = async () => {
    try {
      await pos.closeActiveOrder();
      router.push('/pos');
    } catch (error) {
      setFeedback({ tone: 'error', text: describe(error) });
    }
  };

  return (
    <div className="flex h-screen flex-col bg-bg text-text" dir={i18n.dir}>
      <AppHeader
        leading={
          <IconButton label={i18n.t('common.cancel')} onClick={() => router.push('/pos')}>
            <ArrowRight size={22} />
          </IconButton>
        }
        title={`${i18n.t('pos.payment.title')} · ${order.toSnapshot().number}`}
        trailing={
          <>
            <StatusChip label={i18n.t('pos.status.savedLocally')} tone="warning" dot />
            <Numeric className="text-num-base">{formatTime(new Date())}</Numeric>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col-reverse gap-16 overflow-y-auto p-16 md:flex-row md:overflow-visible">
        <div className="flex min-w-0 flex-1 flex-col gap-14">
          {feedback ? (
            <div
              role="status"
              aria-live="polite"
              className={
                feedback.tone === 'ok'
                  ? 'flex items-center gap-8 rounded-lg border border-success bg-success-tint px-14 py-10 text-ar-base text-success'
                  : 'flex items-center gap-8 rounded-lg border border-danger bg-danger-tint px-14 py-10 text-ar-base text-danger'
              }
            >
              {feedback.tone === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              {feedback.text}
            </div>
          ) : null}
          {/* What the next tap will actually charge.
              Without this the keypad swallowed every press in silence, and a
              method tapped with nothing typed took the whole balance with no
              warning — which is also why splitting a bill felt impossible. */}
          <div className="flex items-center justify-between gap-12 rounded-lg border border-line bg-surface px-16 py-12">
            <div className="flex min-w-0 flex-col">
              <span className="text-ar-sm text-text-muted">{i18n.t('pos.payment.amountToCharge')}</span>
              <span className="truncate text-ar-xs text-text-muted">
                {due <= 0n
                  ? i18n.t('pos.payment.settledAlready')
                  : enteredMinor > 0n
                    ? i18n.t('pos.payment.partial')
                    : i18n.t('pos.payment.splitHint')}
              </span>
            </div>
            <div className="flex flex-none items-center gap-10">
              <Numeric className={enteredMinor > 0n ? 'text-num-3xl font-bold text-accent' : 'text-num-3xl font-bold text-text-muted'}>
                {i18n.money(chargeAmount)}
              </Numeric>
              {enteredMinor > 0n ? (
                <Button variant="secondary" onClick={() => setEntered('')}>
                  {i18n.t('pos.payment.clear')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10">
            <PaymentMethodCard label={i18n.t('pos.payment.cash')} tone="accent" icon={<Banknote size={24} />} disabled={due <= 0n} onClick={() => pay('cash')} />
            <PaymentMethodCard label={i18n.t('pos.payment.bank')} icon={<Landmark size={24} />} disabled={due <= 0n} onClick={() => pay('bank')} />
            <PaymentMethodCard label={i18n.t('pos.payment.wallet')} icon={<Smartphone size={24} />} disabled={due <= 0n} onClick={() => pay('wallet')} />
            <PaymentMethodCard label={i18n.t('pos.payment.credit')} hint={i18n.t('pos.payment.creditNote')} tone="credit" icon={<Clock3 size={24} />} disabled={due <= 0n} onClick={() => pay('credit')} />
          </div>
          <div className="flex flex-wrap gap-10">
            {QUICK_CASH.map((amount) => (
              <QuickCashButton
                key={amount.toString()}
                label={i18n.money(amount)}
                onClick={() => setEntered(amount.toString())}
              />
            ))}
            <QuickCashButton label={i18n.t('pos.payment.fullAmount')} onClick={() => setEntered(due.toString())} />
          </div>
          <Keypad keys={keys} onPress={press} />
        </div>

        <aside className="flex w-full flex-none flex-col gap-12 rounded-xl border border-line bg-surface p-18 md:w-payment-panel">
          <div className="flex items-baseline justify-between">
            <span className="text-ar-base text-text-muted">{i18n.t('pos.cart.total')}</span>
            <Numeric className="text-num-2xl font-semibold">{i18n.money(total)}</Numeric>
          </div>
          <ProgressBar percent={paidPercent} />
          <div className="flex justify-between text-ar-sm text-text-muted">
            <span>{i18n.t('pos.payment.paidPercent', { percent: i18n.int(paidPercent) })}</span>
            <Numeric>{`${i18n.money(paid)} / ${i18n.money(total)}`}</Numeric>
          </div>
          <Divider />
          <span className="text-ar-base text-text-muted">{i18n.t('pos.payment.recorded')}</span>
          <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto">
            {payments.map((payment) => (
              <AmountRow
                key={payment.id}
                label={i18n.t(METHOD_LABEL_KEY[payment.method])}
                note={payment.reference || undefined}
                amount={i18n.money(payment.amountMinor)}
                tone={payment.method === 'credit' ? 'credit' : 'neutral'}
              />
            ))}
          </div>
          <CalloutPanel title={i18n.t('pos.payment.remaining')} tone="neutral">
            <div className="flex items-baseline justify-between">
              <span className="text-ar-base text-text-muted">{i18n.t('pos.payment.change')}</span>
              <Numeric className="text-num-md text-text-muted">{i18n.money(order.changeDue())}</Numeric>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-ar-lg font-semibold">{i18n.t('pos.payment.remaining')}</span>
              <Numeric className="text-num-5xl font-bold text-warning">{i18n.money(due)}</Numeric>
            </div>
          </CalloutPanel>
          <div className="grid grid-cols-[1fr_1.4fr] gap-10">
            <Button variant="secondary" size="xl" onClick={printNow}>
              <span className="flex items-center justify-center gap-6">
                <Printer size={18} />
                {i18n.t('pos.payment.printReceipt')}
              </span>
            </Button>
            <Button variant="primary" size="xl" disabled={due > 0n} onClick={closeBill}>
              {i18n.t('pos.payment.closeBill')}
            </Button>
          </div>
        </aside>
      </div>

      {referenceFor ? (
        <ReferenceDialog
          method={referenceFor}
          amount={i18n.money(chargeAmount)}
          onConfirm={(reference) => {
            const method = referenceFor;
            setReferenceFor(null);
            payWith(method, WALK_IN_CUSTOMER_ID, reference);
          }}
          onCancel={() => setReferenceFor(null)}
        />
      ) : null}

      {pickingCustomer ? (
        <CustomerPicker
          customers={customers}
          amount={i18n.money(chargeAmount)}
          onPick={(customerId) => {
            setPickingCustomer(false);
            payWith('credit', customerId);
          }}
          onCancel={() => setPickingCustomer(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Who owes this. Search is a plain filter over what the device already holds —
 * no network, because the till takes credit whether or not there is a line.
 */
function CustomerPicker({
  customers,
  amount,
  onPick,
  onCancel,
}: {
  customers: CustomerRecord[];
  amount: string;
  onPick(customerId: string): void;
  onCancel(): void;
}) {
  const i18n = useI18n();
  const [query, setQuery] = useState('');
  const term = query.trim();
  const shown = term
    ? customers.filter((c) => c.name.includes(term) || c.phone.includes(term))
    : customers;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir={i18n.dir}>
      <button type="button" aria-label={i18n.t('pos.payment.cancel')} onClick={onCancel} className="absolute inset-0 bg-black/50" />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-line bg-surface sm:rounded-2xl">
        <div className="flex flex-none flex-col gap-10 border-b border-line p-16">
          <div className="flex items-baseline justify-between gap-12">
            <span className="text-ar-lg font-bold">{i18n.t('pos.payment.pickCustomer')}</span>
            <Numeric className="text-num-lg font-bold text-credit">{amount}</Numeric>
          </div>
          <TextField value={query} onChange={(event) => setQuery(event.target.value)} placeholder={i18n.t('pos.payment.searchCustomer')} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-12">
          {customers.length === 0 ? (
            <p className="p-12 text-ar-base text-text-muted">{i18n.t('pos.payment.noCustomers')}</p>
          ) : (
            <div className="flex flex-col gap-6">
              {shown.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onPick(customer.id)}
                  className="flex min-h-control-xl items-center justify-between gap-12 rounded-lg border border-line bg-surface-2 px-14 text-start"
                >
                  <span className="truncate text-ar-base font-medium">{customer.name}</span>
                  {customer.phone ? (
                    <span className="numeric text-num-sm text-text-muted" dir="ltr">{customer.phone}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-none gap-10 border-t border-line p-14">
          {/* Still possible to take unnamed counter credit — it is sometimes the
              honest answer — but now it is a choice rather than the only path. */}
          <Button variant="secondary" onClick={() => onPick(WALK_IN_CUSTOMER_ID)}>
            {i18n.t('pos.payment.useWalkIn')}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {i18n.t('pos.payment.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The reference of a transfer or wallet payment, typed from the customer's
 * confirmation. Recording is manual — the dialog says so — and something too
 * short to identify a transaction is not accepted.
 */
function ReferenceDialog({
  method,
  amount,
  onConfirm,
  onCancel,
}: {
  method: 'bank' | 'wallet';
  amount: string;
  onConfirm(reference: string): void;
  onCancel(): void;
}) {
  const i18n = useI18n();
  const [reference, setReference] = useState('');
  const usable = isUsableReference(reference);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir={i18n.dir}>
      <button type="button" aria-label={i18n.t('pos.payment.cancel')} onClick={onCancel} className="absolute inset-0 bg-black/50" />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={i18n.t('pos.payment.referenceTitle')}
        onSubmit={(event) => {
          event.preventDefault();
          if (usable) onConfirm(reference);
        }}
        className="relative flex w-full max-w-md flex-col gap-12 rounded-t-2xl border border-line bg-surface p-16 sm:rounded-2xl"
      >
        <div className="flex items-baseline justify-between gap-12">
          <span className="text-ar-lg font-bold">
            {i18n.t('pos.payment.referenceTitle')} · {i18n.t(METHOD_LABEL_KEY[method])}
          </span>
          <Numeric className="text-num-lg font-bold">{amount}</Numeric>
        </div>
        <TextField
          autoFocus
          dir="ltr"
          maxLength={MAX_REFERENCE_LENGTH}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder={i18n.t('pos.payment.referencePlaceholder')}
          aria-label={i18n.t('pos.payment.referenceTitle')}
        />
        <span className="text-ar-sm text-text-muted">{i18n.t('pos.payment.referenceHint')}</span>
        <div className="grid grid-cols-[1.4fr_1fr] gap-10">
          <Button type="submit" variant="primary" disabled={!usable}>
            {i18n.t('pos.payment.referenceConfirm')}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {i18n.t('pos.payment.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
