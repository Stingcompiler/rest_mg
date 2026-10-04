/**
 * The part of the Web Storage API the public page uses, and a stand-in for a
 * browser that blocks it (a private window, storage turned off). Reading or
 * writing then simply does nothing.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const NOTHING: KeyValueStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export function browserStorage(): KeyValueStorage {
  try {
    return typeof window === 'undefined' ? NOTHING : window.localStorage;
  } catch {
    return NOTHING;
  }
}

/** Read, swallowing a blocked storage or a value that is not JSON. */
export function readJson<T>(storage: KeyValueStorage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(storage: KeyValueStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked or full: the page works without it.
  }
}

export function removeKey(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}
