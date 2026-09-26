/**
 * The transport seam.
 *
 * Browsers cannot open a raw TCP socket, so the real transport is a native
 * socket in the Capacitor Android shell (decision 1 in docs/PLAN.md). The app
 * codes against `PrintService`, never against a socket, so the queue and the
 * templates are testable against a fake and the transport can be swapped without
 * touching them.
 *
 * `send` rejects on any failure — no printer, refused connection, timeout. The
 * queue treats a rejection as "try again later", never as data loss.
 */
import type { PrintDestination } from '@/db';

export interface PrintService {
  /** Write bytes to the named printer. Rejects if the printer cannot be reached. */
  send(destination: PrintDestination, bytes: Uint8Array): Promise<void>;
}

export interface PrinterTarget {
  host: string;
  port: number;
}

export type PrinterConfig = Record<PrintDestination, PrinterTarget>;

/**
 * A shape a Capacitor TCP-socket plugin is expected to expose. The concrete
 * plugin is wired in the Android build; here we only depend on this contract.
 */
export interface TcpSocketPlugin {
  connect(options: { host: string; port: number }): Promise<{ client: number }>;
  send(options: { client: number; data: string }): Promise<void>;
  close(options: { client: number }): Promise<void>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Sends over a native TCP socket to a thermal printer on port 9100. Used inside
 * the Android shell. When the plugin is not present (a plain browser, dev), it
 * reports failure so jobs stay queued rather than silently vanishing.
 */
export class TcpPrintService implements PrintService {
  constructor(
    private readonly config: PrinterConfig,
    private readonly plugin: TcpSocketPlugin | null,
  ) {}

  async send(destination: PrintDestination, bytes: Uint8Array): Promise<void> {
    if (!this.plugin) {
      throw new Error('No TCP socket transport available (not running in the Android shell).');
    }
    const target = this.config[destination];
    const { client } = await this.plugin.connect({ host: target.host, port: target.port });
    try {
      await this.plugin.send({ client, data: bytesToBase64(bytes) });
    } finally {
      await this.plugin.close({ client });
    }
  }
}

/**
 * An in-memory transport for tests and the browser preview. Records what it was
 * asked to send, and can be told to fail so the queue's retry path can be
 * exercised.
 */
export class FakePrintService implements PrintService {
  readonly sent: { destination: PrintDestination; bytes: Uint8Array }[] = [];
  failing = false;

  async send(destination: PrintDestination, bytes: Uint8Array): Promise<void> {
    if (this.failing) throw new Error('printer offline');
    this.sent.push({ destination, bytes });
  }
}
