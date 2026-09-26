/**
 * Local PIN hashing.
 *
 * The cashier's PIN is checked on the device, against a hash in IndexedDB, with
 * no network and no server ever involved — that is the whole authentication
 * story for `/pos`. PBKDF2 over WebCrypto gives a salted, slow hash so a stolen
 * tablet's database does not hand over the PINs; the raw PIN is never stored and
 * never transmitted.
 */

const ITERATIONS = 150_000;
const HASH = 'SHA-256';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH },
    keyMaterial,
    256,
  );
  return toHex(bits);
}

export interface HashedPin {
  pinHash: string;
  pinSalt: string;
}

export async function hashPin(pin: string): Promise<HashedPin> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinHash = await derive(pin, salt);
  return { pinHash, pinSalt: toHex(salt.buffer as ArrayBuffer) };
}

export async function verifyPin(pin: string, hashed: HashedPin): Promise<boolean> {
  const candidate = await derive(pin, fromHex(hashed.pinSalt));
  // Constant-time compare: equal length is guaranteed by a fixed 256-bit output.
  if (candidate.length !== hashed.pinHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    mismatch |= candidate.charCodeAt(i) ^ hashed.pinHash.charCodeAt(i);
  }
  return mismatch === 0;
}
