'use client';

/**
 * Customers and what they owe.
 *
 * Credit was always recorded on the bill; what was missing was somebody to point
 * at, and any way to collect. This is both: a list ordered by who owes most, a
 * statement showing every credit sale and every repayment, and the button that
 * records money coming back.
 *
 * Repayment never edits the sale. It is its own line, and the balance is the
 * difference — so a bill from last month still reads exactly as it happened.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Receipt, UserPlus, Wallet, X } from 'lucide-react';

import { Button, EmptyState, ErrorState, IconButton, LoadingList, Pager, TextField } from '@/components';
import { useModalDialog } from '@/lib/useModalDialog';
import { formatDate, formatTime, useI18n } from '@/i18n';
import { pageWindow } from '@/lib/paging';
import { ManagerShell } from './ManagerShell';
import {
  useCreateCustomer,
  useCustomers,
  useRetireCustomer,
  useSettleCustomer,
  useStatement,
} from './hooks';
import type { Customer } from './api';
import { describeError } from '@/lib/describeError';

/** Receivables are worked from the top; a screenful at a time is enough. */
const PAGE_SIZE = 25;
/** A statement is read newest-first; a dozen lines fills the sheet. */
const STATEMENT_PAGE_SIZE = 12;

const inputClass =
  'min-h-control-lg rounded-md border border-line bg-surface px-12 text-ar-base text-text outline-none focus-visible:border-accent';

export function CustomersScreen() {
  const i18n = useI18n();
  const [search, setSearch] = useState('');
  const [owingOnly, setOwingOnly] = useState(false);
  const [openStatement, setOpenStatement] = useState<Customer | null>(null);
  const [offset, setOffset] = useState(0);
  const customers = useCustomers({
    q: search || undefined,
    owing: owingOnly || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  // A new search is a different list; page 3 of the old one means nothing.
  useEffect(() => {
    setOffset(0);
  }, [search, owingOnly]);

  const rows = customers.data?.results ?? [];
  // From the server, covering every customer the filter matched. Adding up the
  // rows on screen would quietly drop everyone on the pages behind this one.
  const outstanding = BigInt(customers.data?.outstanding_minor ?? '0');

  return (
    <ManagerShell title={i18n.t('customers.title')} description={i18n.t('customers.pageDescription')}>
      <div className="flex flex-col gap-16">
        <div className="flex flex-wrap items-center justify-between gap-12 rounded-lg border border-line bg-surface p-16">
          <div className="flex flex-col gap-2">
            <span className="text-ar-sm text-text-muted">{i18n.t('customers.totalOutstanding')}</span>
            <span className="numeric text-num-2xl font-bold text-credit">{i18n.money(outstanding)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-10">
            <TextField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={i18n.t('customers.search')}
              aria-label={i18n.t('customers.search')}
            />
            <Button variant={owingOnly ? 'primary' : 'secondary'} onClick={() => setOwingOnly((v) => !v)}>
              {owingOnly ? i18n.t('customers.all') : i18n.t('customers.owingOnly')}
            </Button>
          </div>
        </div>

        <AddCustomerForm />

        {customers.isLoading ? (
          <LoadingList rows={4} rowClassName="h-control-xl" />
        ) : customers.isError ? (
          <ErrorState
          title={i18n.t('common.loadFailed')}
          detail={i18n.t(describeError(customers.error))}
          retryLabel={i18n.t('common.retry')}
          onRetry={() => void customers.refetch()}
          icon={<AlertTriangle size={30} />}
        />
        ) : rows.length === 0 ? (
          <EmptyState title={i18n.t(owingOnly ? 'customers.noneOwing' : 'customers.empty')} icon={<Wallet size={30} />} />
        ) : (
          <div className="flex flex-col gap-8">
            {rows.map((person) => (
              <CustomerRow key={person.id} person={person} onStatement={() => setOpenStatement(person)} />
            ))}
            <Pager
              window={pageWindow(customers.data?.total ?? 0, PAGE_SIZE, offset)}
              onOffset={setOffset}
              busy={customers.isFetching}
            />
          </div>
        )}
      </div>

      {openStatement ? (
        <StatementSheet customer={openStatement} onClose={() => setOpenStatement(null)} />
      ) : null}
    </ManagerShell>
  );
}

function AddCustomerForm() {
  const i18n = useI18n();
  const create = useCreateCustomer();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('customers.required'));
      return;
    }
    create.mutate(
      { name: name.trim(), phone: phone.trim() },
      {
        onSuccess: () => {
          setName('');
          setPhone('');
        },
        onError: (caught) => setError(i18n.t(describeError(caught))),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-12 rounded-lg border border-line bg-surface p-16">
      <label className="flex min-w-0 flex-1 flex-col gap-6 text-ar-sm text-text-muted">
        {i18n.t('customers.name')}
        <TextField value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-6 text-ar-sm text-text-muted">
        {i18n.t('customers.phone')}
        <TextField value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" />
      </label>
      <Button type="submit" variant="primary" disabled={create.isPending}>
        <span className="flex items-center gap-6">
          <UserPlus size={18} />
          {i18n.t('customers.create')}
        </span>
      </Button>
      {error ? <span className="w-full text-ar-sm text-danger">{error}</span> : null}
    </form>
  );
}

function CustomerRow({ person, onStatement }: { person: Customer; onStatement: () => void }) {
  const i18n = useI18n();
  const retire = useRetireCustomer();
  const balance = BigInt(person.balance_minor);

  return (
    <div className="flex flex-wrap items-center gap-x-16 gap-y-8 rounded-lg border border-line bg-surface p-14">
      <div className="flex min-w-0 flex-1 basis-field-min flex-col">
        <span className="truncate text-ar-base font-medium">{person.name}</span>
        {person.phone ? (
          <span className="numeric text-ar-sm text-text-muted" dir="ltr">{person.phone}</span>
        ) : null}
      </div>
      <div className="flex flex-col items-end">
        <span className="text-ar-xs text-text-muted">{i18n.t('customers.balance')}</span>
        <span className={balance > 0n ? 'numeric text-num-lg font-bold text-credit' : 'numeric text-num-lg text-text-muted'}>
          {i18n.money(balance)}
        </span>
      </div>
      <div className="flex gap-8">
        <Button variant="secondary" onClick={onStatement}>
          <span className="flex items-center gap-6">
            <Receipt size={16} />
            {i18n.t('customers.statement')}
          </span>
        </Button>
        {person.is_active ? (
          <Button variant="danger" onClick={() => retire.mutate(person.id)} disabled={retire.isPending}>
            {i18n.t('customers.retire')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StatementSheet({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  // Focus in, Tab kept inside, Escape out (batch 15).
  const panel = useRef<HTMLDivElement>(null);
  useModalDialog(panel, onClose);
  const i18n = useI18n();
  const [lineOffset, setLineOffset] = useState(0);
  const statement = useStatement(customer.id, {
    limit: STATEMENT_PAGE_SIZE,
    offset: lineOffset,
  });
  const settle = useSettleCustomer();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const current = statement.data?.customer ?? customer;
  const balance = BigInt(current.balance_minor);

  const record = () => {
    setError(null);
    setDone(false);
    const digits = amount.replace(/[^\d]/g, '');
    if (!digits || BigInt(digits) <= 0n) {
      setError(i18n.t('error.payment_invalid'));
      return;
    }
    settle.mutate(
      { id: customer.id, body: { amount_minor: digits, method } },
      {
        onSuccess: () => {
          setAmount('');
          setDone(true);
        },
        onError: (caught) => setError(i18n.t(describeError(caught))),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir={i18n.dir}>
      <button type="button" tabIndex={-1} aria-label={i18n.t('customers.close')} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={current.name}
        className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border border-line bg-surface sm:rounded-xl"
      >
        <div className="flex flex-none items-center justify-between border-b border-line px-16 py-12">
          <div className="flex flex-col">
            <span className="text-ar-lg font-bold">{current.name}</span>
            <span className="text-ar-sm text-text-muted">{i18n.t('customers.statement')}</span>
          </div>
          <IconButton variant="quiet" label={i18n.t('customers.close')} onClick={onClose}>
            <X size={22} />
          </IconButton>
        </div>

        <div className="flex flex-none justify-between gap-12 border-b border-line bg-surface-2 px-16 py-12">
          <Figure label={i18n.t('customers.owed')} value={i18n.money(BigInt(current.owed_minor))} />
          <Figure label={i18n.t('customers.settled')} value={i18n.money(BigInt(current.settled_minor))} />
          <Figure label={i18n.t('customers.balance')} value={i18n.money(balance)} strong />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-16">
          {statement.isLoading ? (
            <LoadingList rows={3} rowClassName="h-control-lg" />
          ) : (statement.data?.results.length ?? 0) === 0 ? (
            <EmptyState title={i18n.t('customers.empty')} />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {(statement.data?.results ?? []).map((line) => {
                const at = new Date(line.at);
                const isCharge = line.kind === 'charge';
                return (
                  <li key={`${line.kind}-${line.id}`} className="flex items-center gap-12 py-10">
                    <span className={isCharge ? 'text-ar-base text-credit' : 'text-ar-base text-success'}>
                      {i18n.t(isCharge ? 'customers.charge' : 'customers.settlementLine')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ar-sm text-text-muted">
                      {isCharge && line.order_number
                        ? `${i18n.t('customers.order')} ${line.order_number}`
                        : line.reference}
                    </span>
                    <span className="text-ar-xs text-text-muted" dir="ltr">
                      {formatDate(at)} {formatTime(at)}
                    </span>
                    <span className={isCharge ? 'numeric text-num-base text-credit' : 'numeric text-num-base text-success'}>
                      {isCharge ? '+' : '−'}
                      {i18n.money(BigInt(line.amount_minor))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Pager
            window={pageWindow(statement.data?.total ?? 0, STATEMENT_PAGE_SIZE, lineOffset)}
            onOffset={setLineOffset}
            busy={statement.isFetching}
          />
        </div>

        {balance > 0n ? (
          <div className="flex flex-none flex-col gap-10 border-t border-line bg-surface-2 p-16">
            <span className="text-ar-md font-medium">{i18n.t('customers.settle')}</span>
            <div className="flex flex-wrap items-end gap-10">
              <label className="flex min-w-0 flex-1 flex-col gap-6 text-ar-sm text-text-muted">
                {i18n.t('customers.settleAmount')}
                <TextField value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" dir="ltr" />
              </label>
              <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
                {i18n.t('customers.settleMethod')}
                <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="cash">{i18n.t('pos.payment.cash')}</option>
                  <option value="bank">{i18n.t('pos.payment.bank')}</option>
                  <option value="wallet">{i18n.t('pos.payment.wallet')}</option>
                </select>
              </label>
              <Button variant="primary" onClick={record} disabled={settle.isPending}>
                {i18n.t('customers.settle')}
              </Button>
            </div>
            {error ? <span className="text-ar-sm text-danger">{error}</span> : null}
            {done && !error ? <span className="text-ar-sm text-success">{i18n.t('customers.settled_ok')}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-ar-xs text-text-muted">{label}</span>
      <span className={strong ? 'numeric text-num-lg font-bold text-credit' : 'numeric text-num-base'}>{value}</span>
    </div>
  );
}
