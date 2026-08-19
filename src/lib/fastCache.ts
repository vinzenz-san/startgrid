/** Synchronous localStorage cache for a single key, used as a first-paint
 *  fast-path ahead of async storage.sync/storage.local hydration. `json:
 *  true` JSON-encodes non-string values; omit it for plain string values. */
export function createFastCache<T>(key: string, opts?: { json?: boolean }) {
  return {
    read(): T | null {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        return (opts?.json ? JSON.parse(raw) : raw) as T;
      } catch { return null; }
    },
    write(value: T | null): void {
      try {
        if (value === null) { localStorage.removeItem(key); return; }
        localStorage.setItem(key, opts?.json ? JSON.stringify(value) : (value as unknown as string));
      } catch {}
    },
  };
}
