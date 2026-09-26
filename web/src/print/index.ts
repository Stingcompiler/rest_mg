/**
 * Printing: persist-before-print, retry-on-failure, never block the flow.
 *
 * The two entry points the cashier flow calls — `printKitchenTicket` on send,
 * `printReceipt` once the bill is paid — each render a document to ESC/POS bytes
 * and enqueue it durably before any send is attempted. The pump drains the queue
 * in the background.
 */
import type { Order, Shift } from '@/domain';
import {
  buildKitchenTicket,
  buildReceipt,
  buildShiftReport,
  renderDocument,
  type PrintContext,
} from './document';
import { enqueuePrintJob } from './queue';
import { printDocumentInBrowser } from './html';
import type { PrintService } from './PrintService';
import { FakePrintService, TcpPrintService, type PrinterConfig, type TcpSocketPlugin } from './PrintService';

export {
  renderDocument,
  buildKitchenTicket,
  buildReceipt,
  buildShiftReport,
  type PrintContext,
} from './document';
export { EscPosBuilder, utf8Encoder } from './escpos';
export { buildPrintContext } from './context';
export {
  drainPrintQueue,
  enqueuePrintJob,
  pendingPrintJobs,
  startPrintPump,
} from './queue';
export {
  FakePrintService,
  TcpPrintService,
  type PrintService,
  type PrinterConfig,
} from './PrintService';

/** Kitchen ticket — printed on send, before payment. */
export async function printKitchenTicket(order: Order, ctx: PrintContext): Promise<void> {
  const bytes = renderDocument(buildKitchenTicket(order, ctx));
  await enqueuePrintJob({ orderId: order.id, destination: 'kitchen', kind: 'kitchen', bytes });
}

/** Final receipt — printed only once the amount due reaches zero. */
export async function printReceipt(order: Order, ctx: PrintContext): Promise<void> {
  const bytes = renderDocument(buildReceipt(order, ctx));
  await enqueuePrintJob({ orderId: order.id, destination: 'cashier', kind: 'receipt', bytes });
}

const DEV_PRINTER_CONFIG: PrinterConfig = {
  cashier: { host: '192.168.1.50', port: 9100 },
  kitchen: { host: '192.168.1.51', port: 9100 },
};

interface CapacitorWindow {
  Capacitor?: { Plugins?: { TcpSocket?: TcpSocketPlugin } };
}

let serviceSingleton: PrintService | null = null;

/**
 * The transport for this environment. Inside the Android shell it is a real TCP
 * socket; in a plain browser (dev, preview) it is the fake, so the flow
 * completes and jobs do not pile up against a printer that isn't there.
 */
export function getPrintService(): PrintService {
  if (serviceSingleton) return serviceSingleton;
  const plugin =
    typeof window !== 'undefined'
      ? (window as unknown as CapacitorWindow).Capacitor?.Plugins?.TcpSocket ?? null
      : null;
  serviceSingleton = plugin ? new TcpPrintService(DEV_PRINTER_CONFIG, plugin) : new FakePrintService();
  // Dev/preview only: expose the fake transport so its behaviour (what it was
  // asked to print, and forcing a failure) can be inspected from the console.
  // The fake exists only outside the Android shell, so this never ships to a
  // real device.
  if (serviceSingleton instanceof FakePrintService && typeof window !== 'undefined') {
    (window as unknown as { __printService?: FakePrintService }).__printService = serviceSingleton;
  }
  return serviceSingleton;
}

export { renderDocumentToHtml, printDocumentInBrowser } from './html';

/**
 * Print a receipt to actual paper via the browser, for a device with no thermal
 * printer on the network. Returns false if the print window was blocked.
 */
export function printReceiptToPaper(order: Order, ctx: PrintContext, title?: string): boolean {
  return printDocumentInBrowser(buildReceipt(order, ctx), title);
}

/**
 * The shift's closing report on paper. Goes through the browser rather than the
 * thermal queue: it is printed once, by somebody standing there handing over,
 * who needs to know immediately whether it came out.
 */
export function printShiftReportToPaper(shift: Shift, ctx: PrintContext, title?: string): boolean {
  return printDocumentInBrowser(buildShiftReport(shift, ctx), title);
}
