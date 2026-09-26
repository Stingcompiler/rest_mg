/**
 * Thin promise wrappers over the raw IndexedDB API.
 *
 * IndexedDB is event-based and easy to get subtly wrong — awaiting the wrong
 * signal, or resolving before a transaction has actually committed. These four
 * helpers are the only place that talks to requests and transactions directly;
 * everything else in `db/` awaits a promise.
 */

/** Resolve when a single request succeeds. */
export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Resolve when the transaction has **committed** — not when its last request
 * succeeded. A write is only durable once `complete` fires; anything that
 * matters keys off this, so a crash between a put and its commit leaves nothing.
 */
export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (fallback: string) => {
      if (settled) return;
      settled = true;
      // An explicit abort() carries no error, so always reject with something
      // truthy — a caller must be able to tell success from failure.
      reject(tx.error ?? new Error(fallback));
    };
    tx.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    tx.onabort = () => fail('Transaction aborted');
    tx.onerror = () => fail('Transaction failed');
  });
}

/** Collect every row an index or store cursor yields. */
export function getAll<T>(source: IDBObjectStore | IDBIndex, query?: IDBValidKey | IDBKeyRange): Promise<T[]> {
  return request(source.getAll(query) as IDBRequest<T[]>);
}

export function count(source: IDBObjectStore | IDBIndex, query?: IDBValidKey | IDBKeyRange): Promise<number> {
  return request(source.count(query));
}
