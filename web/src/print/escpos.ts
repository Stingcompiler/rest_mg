/**
 * An ESC/POS command builder.
 *
 * Thermal receipt printers speak ESC/POS: a stream of control codes interleaved
 * with text bytes. This builder accumulates those bytes and hands back a
 * `Uint8Array` the transport writes to the printer's socket. It is pure and
 * deterministic — the same document always produces the same bytes — which is
 * what lets a queued job be retried byte-for-byte after the printer comes back.
 *
 * On Arabic: ESC/POS has no bidi engine. Text is emitted as raw bytes in the
 * order given, and how Arabic renders depends on the printer's firmware and code
 * page. This builder handles code-page selection and right-alignment; the
 * document layer is responsible for the visual order of the string. UTF-8 is the
 * default encoder (for printers with Arabic firmware); a CP864 mapping is a
 * per-device concern flagged in the print README, not baked in here.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type Align = 'left' | 'center' | 'right';
export type Encoder = (text: string) => Uint8Array;

const utf8 = new TextEncoder();
export const utf8Encoder: Encoder = (text) => utf8.encode(text);

const ALIGN_CODE: Record<Align, number> = { left: 0, center: 1, right: 2 };

export class EscPosBuilder {
  private readonly bytes: number[] = [];

  constructor(private readonly encoder: Encoder = utf8Encoder) {}

  private push(...values: number[]): this {
    this.bytes.push(...values);
    return this;
  }

  /** ESC @ — reset the printer to a known state. Always start here. */
  init(): this {
    return this.push(ESC, 0x40);
  }

  /** ESC t n — select a character code page (printer-specific numbering). */
  codepage(page: number): this {
    return this.push(ESC, 0x74, page & 0xff);
  }

  align(align: Align): this {
    return this.push(ESC, 0x61, ALIGN_CODE[align]);
  }

  bold(on: boolean): this {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }

  /** GS ! n — width/height multipliers, 1–8 each. */
  size(width: number, height: number): this {
    const w = Math.max(1, Math.min(8, width)) - 1;
    const h = Math.max(1, Math.min(8, height)) - 1;
    return this.push(GS, 0x21, (w << 4) | h);
  }

  text(value: string): this {
    return this.push(...this.encoder(value));
  }

  line(value = ''): this {
    return this.text(value).push(LF);
  }

  feed(lines = 1): this {
    return this.push(ESC, 0x64, Math.max(0, Math.min(255, lines)));
  }

  raw(bytes: Uint8Array | number[]): this {
    return this.push(...Array.from(bytes));
  }

  /** GS V — partial cut, after feeding the paper clear of the head. */
  cut(): this {
    return this.feed(3).push(GS, 0x56, 66, 0);
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}
