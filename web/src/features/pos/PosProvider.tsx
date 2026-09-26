'use client';

/**
 * The cashier's state hub.
 *
 * It holds the live domain entities — a CartSession of open orders and the
 * active Shift — in refs, and re-renders by bumping a version. Every action
 * mutates the entity in memory (so the screen repaints immediately) and then
 * persists to IndexedDB in the background; nothing on this path awaits the
 * network, and nothing awaits a write before painting. Durability-critical
 * transitions (closing an order, closing the shift) do await their write, so a
 * receipt is never printed before the record is safe.
 *
 * There is no network here by construction, and the `no-network-in-pos` lint
 * rule keeps it that way.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  fromMinor,
  menuRepository,
  openDatabase,
  orderRepository,
  pendingCount,
  settingsRepository,
  shiftRepository,
  type MenuItemRecord,
} from '@/db';
import { runSync, startSyncPump } from '@/sync';
import {
  hydrateMenuItem,
  hydrateOrder,
  orderToRecord,
  shiftRecordToSnapshot,
  shiftToRecord,
} from '@/db/mappers';
import {
  CartSession,
  CashCount,
  MenuItem,
  Order,
  Shift,
  newId,
  type NewPaymentInput,
  type Money,
} from '@/domain';
import {
  buildPrintContext,
  drainPrintQueue,
  getPrintService,
  printKitchenTicket,
  printReceipt,
  startPrintPump,
} from '@/print';
import { readLocale, readNumerals } from '@/i18n/preferences';
import { useAuth } from '@/features/auth/AuthProvider';
import { seedCategories, seedItems } from './seed-data';

/** The print context for the cashier's current language and numerals. */
function currentPrintContext() {
  return buildPrintContext(readLocale(), readNumerals());
}

/** Nudge the print queue to drain now rather than waiting for the interval. */
function kickPrintQueue() {
  void drainPrintQueue(getPrintService()).catch((error) => console.error('[print] drain', error));
}

export interface PosMenuCategory {
  id: string;
  nameAr: string;
  nameEn: string;
  items: MenuItem[];
}

interface PosContextValue {
  ready: boolean;
  categories: PosMenuCategory[];
  itemById: Map<string, MenuItem>;

  cart: CartSession;
  activeOrder: Order | null;
  shift: Shift;

  /** Connection state and the unsynced-record count — always visible in the header. */
  online: boolean;
  pendingCount: number;
  /**
   * Customer delivery orders waiting to be confirmed, learned from the sync
   * loop. `/pos` never fetches — this arrives on the background run that was
   * already happening, which is the only way the till is allowed to know.
   */
  pendingDeliveries: string[] | null;
  /** Force a sync now. Background sync makes this never *required*. */
  syncNow(): void;

  // Order entry
  newCart(): Promise<void>;
  switchCart(orderId: string): void;
  parkActive(): void;
  addItem(itemId: string): void;
  changeQty(lineId: string, delta: number): void;
  applyDiscount(amountMinor: Money): void;
  sendToKitchen(): void;

  // Payment
  addPayment(input: NewPaymentInput): void;
  closeActiveOrder(): Promise<void>;

  // Open orders
  resumeOrder(orderId: string): void;
  cancelOrder(orderId: string, reason: string): Promise<void>;

  // Menu management
  setItemPrice(itemId: string, newPriceMinor: Money): Promise<void>;
  toggleItemAvailability(itemId: string): Promise<void>;
  bulkPriceChange(categoryId: string, percent: number): Promise<void>;

  // Shift
  setDenominationCount(denominationMinor: Money | null, label: string, count: number): void;
  setVarianceReason(reason: string): void;
  closeShift(): Promise<void>;
}

const PosContext = createContext<PosContextValue | null>(null);

/**
 * Bring the device's bootstrap menu up to date before anything reads it.
 *
 * Two cases: a fresh device has no menu and gets one; a device seeded by an
 * early build has a menu whose ids are readable strings rather than UUIDs. The
 * server stores a menu-item reference as a UUID, so bills carrying those ids
 * were rejected on every sync attempt — for ever, and with nothing on screen to
 * explain it. Those rows are retired and a correct menu seeded in their place.
 *
 * Bills already taken are untouched: a line carries its own name and price, so
 * the record of what was sold and for how much is unaffected.
 */
async function seedOrRepairMenu(): Promise<void> {
  const retired = await menuRepository.retireNonUuidRows();
  const categories = await menuRepository.listCategories();
  if (categories.length === 0) {
    await menuRepository.applyPull(seedCategories(), seedItems());
  }
  if (retired > 0) {
    console.info(`[pos] retired ${retired} legacy menu rows and re-seeded with UUID ids`);
  }
}

async function nextOrderNumber(): Promise<string> {
  const current = (await settingsRepository.get<number>('orderSeq')) ?? 1048;
  await settingsRepository.set('orderSeq', current + 1);
  return String(current);
}

export function PosProvider({ children }: { children: React.ReactNode }) {
  // The signed-in cashier. Their name is snapshotted onto every order and
  // shift, so the day and night cashiers' work is attributable to each of them.
  const auth = useAuth();
  const cashierRef = useRef({ id: auth.user?.id ?? null, name: auth.user?.display_name ?? '' });
  cashierRef.current = { id: auth.user?.id ?? null, name: auth.user?.display_name ?? '' };

  const cartRef = useRef<CartSession>(new CartSession());
  const shiftRef = useRef<Shift | null>(null);
  const [categories, setCategories] = useState<PosMenuCategory[]>([]);
  const itemByIdRef = useRef<Map<string, MenuItem>>(new Map());
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  // null until a sync run has actually answered. Starting at [] would make
  // the first successful run look like three orders arriving at once.
  const [pendingDeliveries, setPendingDeliveries] = useState<string[] | null>(null);

  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const refreshPending = useCallback(async () => {
    const db = await openDatabase();
    setPending(await pendingCount(db));
  }, []);

  // --- initial load from IndexedDB (no network) -----------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await seedOrRepairMenu();

      const categoryRecords = await menuRepository.listCategories();
      const menu: PosMenuCategory[] = [];
      const index = new Map<string, MenuItem>();
      for (const category of categoryRecords) {
        const itemRecords = await menuRepository.listItemsByCategory(category.id);
        const items = itemRecords.map((record: MenuItemRecord) => {
          const item = hydrateMenuItem(record);
          index.set(item.id, item);
          return item;
        });
        menu.push({ id: category.id, nameAr: category.nameAr, nameEn: category.nameEn, items });
      }

      // Restore any open carts left on the device.
      const openRecords = await orderRepository.listOpen();
      const session = new CartSession();
      for (const record of openRecords) session.open(hydrateOrder(record));

      // Restore or open the shift, and re-attach its closed orders so expected
      // cash is correct after a reload.
      const activeShiftRecord = await shiftRepository.activeShift();
      let shift: Shift;
      if (activeShiftRecord) {
        shift = Shift.fromSnapshot(shiftRecordToSnapshot(activeShiftRecord));
        const closed = await orderRepository.listByStatus('closed');
        for (const record of closed) {
          if (record.shiftRef === shift.id) shift.addOrder(hydrateOrder(record));
        }
      } else {
        shift = Shift.open({
          cashierId: cashierRef.current.id,
          cashierName: cashierRef.current.name,
        });
        await shiftRepository.save(shiftToRecord(shift));
      }

      if (cancelled) return;
      cartRef.current = session;
      shiftRef.current = shift;
      itemByIdRef.current = index;
      setCategories(menu);
      setReady(true);
      void refreshPending();
    })().catch((error) => console.error('[pos] load failed', error));

    return () => {
      cancelled = true;
    };
  }, []);

  // Drain the print queue in the background — on an interval and on reconnect —
  // so any receipt or ticket left queued by an offline printer eventually goes.
  useEffect(() => startPrintPump(getPrintService()), []);

  // The sync loop: push the outbox and pull menu deltas on an interval and on
  // reconnect. Its result drives the connection indicator and the unsynced
  // count; it never blocks anything the cashier does.
  useEffect(
    () =>
      startSyncPump((result) => {
        if (!result.skipped) setOnline(result.online);
        setPending(result.pending);
        // Undefined means the run never reached the server. Keep the last known
        // list rather than clearing it, so a dropped connection does not read
        // as "nobody is waiting" — the rail's offline dot says the rest.
        if (result.pendingDeliveries) setPendingDeliveries(result.pendingDeliveries);
        // A run that fails says why. This was silent, so a till that had stopped
        // syncing looked exactly like one with nothing to send — and the only
        // clue was an "offline" badge nobody could explain.
        if (result.error) console.error('[sync] run failed:', result.error);
      }),
    [],
  );

  // The browser's own connectivity signal, for the indicator between sync runs.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const syncNow = useCallback(() => {
    void runSync().then((result) => {
      if (!result.skipped) setOnline(result.online);
      setPending(result.pending);
      if (result.pendingDeliveries) setPendingDeliveries(result.pendingDeliveries);
      if (result.error) console.error('[sync] run failed:', result.error);
      bump();
    });
  }, [bump]);

  // Returns the write so a caller can sequence after it. Most callers ignore it
  // (paint first, persist after), but anything that must observe the saved state
  // — syncing a fired ticket, for one — has to await it.
  const persistOrder = useCallback((order: Order) => {
    return orderRepository
      .save(orderToRecord(order))
      .catch((error) => console.error('[pos] save order', error));
  }, []);

  const persistShift = useCallback((shift: Shift) => {
    void shiftRepository.save(shiftToRecord(shift)).catch((error) => console.error('[pos] save shift', error));
  }, []);

  const ensureActiveOrder = useCallback(async (): Promise<Order> => {
    const existing = cartRef.current.active();
    if (existing) return existing;
    const number = await nextOrderNumber();
    const order = Order.create({
      number,
      cashierId: cashierRef.current.id,
      cashierName: cashierRef.current.name,
      shiftRef: shiftRef.current?.id ?? null,
    });
    cartRef.current.open(order);
    persistOrder(order);
    return order;
  }, [persistOrder]);

  // --- actions --------------------------------------------------------------

  const newCart = useCallback(async () => {
    const number = await nextOrderNumber();
    const order = Order.create({
      number,
      cashierId: cashierRef.current.id,
      cashierName: cashierRef.current.name,
      shiftRef: shiftRef.current?.id ?? null,
    });
    cartRef.current.open(order);
    persistOrder(order);
    bump();
  }, [bump, persistOrder]);

  const switchCart = useCallback(
    (orderId: string) => {
      cartRef.current.switchTo(orderId);
      bump();
    },
    [bump],
  );

  const parkActive = useCallback(() => {
    const order = cartRef.current.active();
    if (!order) return;
    cartRef.current.park(order.id);
    persistOrder(order);
    bump();
  }, [bump, persistOrder]);

  const addItem = useCallback(
    (itemId: string) => {
      const item = itemByIdRef.current.get(itemId);
      if (!item || !item.isAvailable()) return;
      void ensureActiveOrder().then((order) => {
        // Tapping the same item again bumps the existing line rather than adding
        // a second — the design shows one line with a quantity, not duplicates.
        const existing = order
          .toSnapshot()
          .lines.find((line) => !line.isVoid && line.itemId === itemId && line.modifiersText === '');
        if (existing) {
          order.changeQty(existing.id, existing.qty + 1);
        } else {
          order.addLine(item.toLine(1).toSnapshot());
        }
        persistOrder(order);
        bump();
      });
    },
    [bump, ensureActiveOrder, persistOrder],
  );

  const changeQty = useCallback(
    (lineId: string, delta: number) => {
      const order = cartRef.current.active();
      if (!order) return;
      const line = order.toSnapshot().lines.find((candidate) => candidate.id === lineId);
      if (!line) return;
      const next = Math.max(1, line.qty + delta);
      order.changeQty(lineId, next);
      persistOrder(order);
      bump();
    },
    [bump, persistOrder],
  );

  const applyDiscount = useCallback(
    (amountMinor: Money) => {
      const order = cartRef.current.active();
      if (!order) return;
      order.applyDiscount(amountMinor);
      persistOrder(order);
      bump();
    },
    [bump, persistOrder],
  );

  const sendToKitchen = useCallback(() => {
    const order = cartRef.current.active();
    if (!order) return;
    order.send();
    // Persist first, then print — a kitchen ticket is never sent for work the
    // device hasn't recorded. The print itself is queued durably and drained in
    // the background, so a dead printer never blocks the send.
    // The sync must wait for the write: the order and its outbox entry land in
    // one transaction, and syncing before that commits would find an empty
    // queue and leave the kitchen waiting a full interval for its ticket.
    void persistOrder(order).then(() => {
      void refreshPending();
      // Nudge the sync so the kitchen display sees the ticket now rather than at
      // the next interval. If the line is down this does nothing and the printed
      // ticket carries the order, which is the point of printing it.
      syncNow();
    });
    void printKitchenTicket(order, currentPrintContext())
      .then(kickPrintQueue)
      .catch((error) => console.error('[print] kitchen ticket', error));
    bump();
  }, [bump, persistOrder, refreshPending, syncNow]);

  const addPayment = useCallback(
    (input: NewPaymentInput) => {
      const order = cartRef.current.active();
      if (!order) return;
      order.addPayment(input);
      persistOrder(order);
      bump();
    },
    [bump, persistOrder],
  );

  const closeActiveOrder = useCallback(async () => {
    const order = cartRef.current.active();
    const shift = shiftRef.current;
    if (!order || !shift) return;
    // Bind it to this shift before closing. An order created while the till was
    // still loading carries no shift, and one with no shift can never be
    // counted into any drawer — its cash vanishes from the close.
    order.attachToShift(shift.id);
    // Throws if an amount is still due — the caller surfaces the message.
    order.close();
    shift.addOrder(order);
    // Durability before the caller navigates or prints: await both writes.
    await orderRepository.save(orderToRecord(order));
    await shiftRepository.save(shiftToRecord(shift));
    // Persist-before-print again: the order is saved above; the receipt is then
    // queued durably. A print failure is caught here and never blocks the close.
    try {
      await printReceipt(order, currentPrintContext());
      kickPrintQueue();
    } catch (error) {
      console.error('[print] receipt', error);
    }
    cartRef.current.close(order.id);
    bump();
    void refreshPending();
    // Push it now rather than at the next interval. A closed bill is the most
    // consequential record the till produces — it is money taken — and leaving
    // it to a timer meant a cashier could settle several bills, look at the
    // report, and be told none of them had reached the server, on a perfectly
    // good connection. If the line is down this is a no-op and the outbox
    // keeps them safely, exactly as before.
    syncNow();
  }, [bump, refreshPending, syncNow]);

  const resumeOrder = useCallback(
    (orderId: string) => {
      cartRef.current.switchTo(orderId);
      bump();
    },
    [bump],
  );

  const cancelOrder = useCallback(
    async (orderId: string, reason: string) => {
      const order = cartRef.current.list().find((candidate) => candidate.id === orderId);
      if (!order) return;
      order.void(reason);
      // A void is terminal, so saving it queues it for sync — the server must
      // learn the order was cancelled, not just see it vanish.
      await orderRepository.save(orderToRecord(order));
      cartRef.current.close(orderId);
      bump();
      void refreshPending();
      // Same reasoning as closing: a cancellation is money *not* taken, and the
      // dashboard should not wait a minute to hear about it.
      syncNow();
    },
    [bump, refreshPending, syncNow],
  );

  const setItemPrice = useCallback(
    async (itemId: string, newPriceMinor: Money) => {
      const item = itemByIdRef.current.get(itemId);
      if (!item) return;
      const previous = item.priceMinor;
      if (newPriceMinor === previous) return;
      item.setPrice(newPriceMinor);
      const now = new Date().toISOString();
      // Records the change and queues a price_change for sync (decision 3).
      await menuRepository.recordPriceEdit({
        id: newId(),
        itemId,
        oldPriceMinor: fromMinor(previous),
        newPriceMinor: fromMinor(newPriceMinor),
        reason: 'manual',
        percent: null,
        appliedAt: now,
        createdAt: now,
        updatedAt: now,
        syncedAt: null,
      });
      bump();
      void refreshPending();
    },
    [bump, refreshPending],
  );

  const toggleItemAvailability = useCallback(
    async (itemId: string) => {
      const item = itemByIdRef.current.get(itemId);
      if (!item) return;
      const next = !item.availableFlag;
      item.setAvailable(next);
      await menuRepository.setAvailability(itemId, next);
      bump();
    },
    [bump],
  );

  const bulkPriceChange = useCallback(
    async (categoryId: string, percent: number) => {
      const category = categories.find((entry) => entry.id === categoryId);
      if (!category) return;
      const now = new Date().toISOString();
      for (const item of category.items) {
        const previous = item.priceMinor;
        item.raisePrice(percent);
        if (item.priceMinor === previous) continue;
        await menuRepository.recordPriceEdit({
          id: newId(),
          itemId: item.id,
          oldPriceMinor: fromMinor(previous),
          newPriceMinor: fromMinor(item.priceMinor),
          reason: 'bulk_percent',
          percent: String(percent),
          appliedAt: now,
          createdAt: now,
          updatedAt: now,
          syncedAt: null,
        });
      }
      bump();
      void refreshPending();
    },
    [bump, categories, refreshPending],
  );

  const setDenominationCount = useCallback(
    (denominationMinor: Money | null, label: string, count: number) => {
      const shift = shiftRef.current;
      if (!shift) return;
      const existing = shift.toSnapshot().counts.filter((row) => row.label !== label);
      const rows = existing.map((row) => CashCount.fromSnapshot(row));
      if (count > 0 || denominationMinor === null) {
        rows.push(
          denominationMinor === null
            ? CashCount.lump(0n, label)
            : CashCount.forDenomination(denominationMinor, count, label),
        );
      }
      shift.setCounts(rows);
      persistShift(shift);
      bump();
    },
    [bump, persistShift],
  );

  const setVarianceReason = useCallback(
    (reason: string) => {
      const shift = shiftRef.current;
      if (!shift) return;
      shift.setVarianceReason(reason);
      persistShift(shift);
      bump();
    },
    [bump, persistShift],
  );

  const closeShift = useCallback(async () => {
    const shift = shiftRef.current;
    if (!shift) return;
    // Throws shift_open_orders / shift_variance_needs_reason — surfaced by caller.
    // It also throws shift_already_closed, which is what stops a second press
    // from closing the same shift twice.
    shift.close();
    await shiftRepository.save(shiftToRecord(shift));

    // The till must always have exactly one open shift. Without this the closed
    // one stayed in memory and kept accepting sales — money landing in a drawer
    // that had already been counted and handed over — until a reload quietly
    // started a fresh shift and the expected cash read zero again.
    const next = Shift.open({
      cashierId: cashierRef.current.id,
      cashierName: cashierRef.current.name,
    });
    await shiftRepository.save(shiftToRecord(next));
    shiftRef.current = next;

    bump();
    // Sync runs on shift close, per the offline contract.
    syncNow();
  }, [bump, syncNow]);

  const value = useMemo<PosContextValue>(
    () => ({
      ready,
      categories,
      itemById: itemByIdRef.current,
      cart: cartRef.current,
      activeOrder: cartRef.current.active(),
      shift: shiftRef.current ?? Shift.open(),
      online,
      pendingCount: pending,
      pendingDeliveries,
      syncNow,
      newCart,
      switchCart,
      parkActive,
      addItem,
      changeQty,
      applyDiscount,
      sendToKitchen,
      addPayment,
      closeActiveOrder,
      resumeOrder,
      cancelOrder,
      setItemPrice,
      toggleItemAvailability,
      bulkPriceChange,
      setDenominationCount,
      setVarianceReason,
      closeShift,
    }),
    // `version` changes on every mutation, giving the context value a new
    // identity so consumers re-render and read the mutated entities. The action
    // callbacks are stable, so these are the real deps.
    [ready, version, categories, online, pending, pendingDeliveries, syncNow],
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos(): PosContextValue {
  const context = useContext(PosContext);
  if (!context) throw new Error('usePos must be used within a PosProvider.');
  return context;
}
