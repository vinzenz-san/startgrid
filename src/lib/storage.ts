/**
 * Storage adapter: uses browser.storage.sync when running as extension,
 * falls back to localStorage for plain-browser preview/dev.
 */

export const isExtension = typeof chrome !== 'undefined' && !!chrome.storage;

async function get(key: string): Promise<unknown> {
  if (isExtension) {
    const { default: browser } = await import('webextension-polyfill');
    const result = await browser.storage.sync.get(key);
    return result[key];
  }
  const raw = localStorage.getItem(`sg:${key}`);
  return raw !== null ? JSON.parse(raw) : undefined;
}

async function set(key: string, value: unknown): Promise<void> {
  if (isExtension) {
    const { default: browser } = await import('webextension-polyfill');
    await browser.storage.sync.set({ [key]: value });
    return;
  }
  localStorage.setItem(`sg:${key}`, JSON.stringify(value));
}

type ChangeListener = (key: string, newValue: unknown) => void;
const localListeners = new Set<ChangeListener>();

function addChangeListener(listener: ChangeListener): () => void {
  if (isExtension) {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    import('webextension-polyfill').then(({ default: browser }) => {
      if (cancelled) return;
      const wrapped = (
        changes: Record<string, { newValue?: unknown }>,
        area: string,
      ) => {
        if (area !== 'sync') return;
        for (const key of Object.keys(changes)) {
          listener(key, changes[key].newValue);
        }
      };
      browser.storage.onChanged.addListener(wrapped);
      cleanup = () => browser.storage.onChanged.removeListener(wrapped);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }

  localListeners.add(listener);
  return () => localListeners.delete(listener);
}

export const storage = { get, set, addChangeListener };
