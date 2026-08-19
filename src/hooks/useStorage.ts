import { useState, useEffect, useRef } from 'react';
import { storage } from '../lib/storage';
import { debounce, type Debounced } from '../lib/debounce';

// chrome.storage.sync enforces MAX_WRITE_OPERATIONS_PER_MINUTE (120/min).
// Continuous updates — dragging a slider, live-resizing a widget — can
// produce far more value changes than that per minute if each one were
// persisted immediately, so bursts are coalesced into one write shortly
// after the value settles instead.
const SAVE_DEBOUNCE_MS = 400;

/**
 * Bridges a single `browser.storage.sync` key into React state: loads the
 * initial value, debounces writes (see `SAVE_DEBOUNCE_MS`) to stay under
 * sync storage's write-rate limit, and listens for `onChanged` so the value
 * stays in sync across tabs/devices without re-fetching. Writes are
 * self-filtered by comparing against the last value this hook itself wrote,
 * so a remote change doesn't get echoed back.
 * @returns `[value, setValue, loaded]` — `loaded` is false until the initial
 * read completes, useful for gating logic that shouldn't run against a
 * still-hydrating default value.
 */
export function useStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const hydrating  = useRef(true);   // true while loading initial value
  const lastSaved  = useRef('');     // JSON of the last value we wrote ourselves
  const debouncedSave = useRef<Debounced<[string, T]> | null>(null);
  if (!debouncedSave.current) {
    debouncedSave.current = debounce((k: string, v: T) => storage.set(k, v), SAVE_DEBOUNCE_MS);
  }

  // ── Initial load ────────────────────────────────
  useEffect(() => {
    storage.get(key).then((stored) => {
      if (stored !== undefined && stored !== null) {
        lastSaved.current = JSON.stringify(stored);
        setValue(stored as T);
      }
      setLoaded(true);
      hydrating.current = false;
    });
  }, [key]);

  // ── Persist on change (debounced) ────────────────
  useEffect(() => {
    if (!loaded || hydrating.current) return;
    const serialized = JSON.stringify(value);
    if (serialized === lastSaved.current) return; // nothing changed
    lastSaved.current = serialized;
    debouncedSave.current!(key, value);
  }, [key, value, loaded]);

  // Flush a still-pending debounced write immediately on unmount, so a
  // change made right before e.g. closing a settings panel isn't dropped.
  useEffect(() => {
    return () => debouncedSave.current!.flush();
  }, []);

  // ── Cross-device sync via onChanged ─────────────
  // Only update state when the change came from ANOTHER source
  // (different tab / different device via Firefox Sync).
  // Our own writes are identified by matching lastSaved.
  useEffect(() => {
    return storage.addChangeListener((changedKey, newValue) => {
      if (changedKey !== key) return;
      const serialized = JSON.stringify(newValue);
      if (serialized === lastSaved.current) return; // own write — skip
      lastSaved.current = serialized;
      hydrating.current = true;
      setValue(newValue as T);
      Promise.resolve().then(() => { hydrating.current = false; });
    });
  }, [key]);

  return [value, setValue, loaded] as const;
}
