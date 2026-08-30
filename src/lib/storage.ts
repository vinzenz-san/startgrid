/**
 * Storage adapter: uses browser.storage.sync when running as extension,
 * falls back to localStorage for plain-browser preview/dev.
 */
// Type-only import — erased at build time. Needed because the package's
// .d.ts uses `export = Browser` (a namespace), which dynamic
// `import('webextension-polyfill').default` typing doesn't resolve cleanly
// once routed through a named function's return type (see useGoogleAuth.ts).
import type Browser from 'webextension-polyfill';

export const isExtension = typeof chrome !== 'undefined' && !!chrome.storage;

// Memoized so every get/set/addChangeListener call reuses the same module
// resolution instead of re-invoking a dynamic import() each time — this
// module is on the hot path of every widget's initial data hydration on
// every new tab.
let browserModule: Promise<{ default: typeof Browser }> | null = null;
function getBrowser(): Promise<{ default: typeof Browser }> {
  if (!browserModule) browserModule = import('webextension-polyfill') as unknown as Promise<{ default: typeof Browser }>;
  return browserModule;
}

async function get(key: string): Promise<unknown> {
  if (isExtension) {
    const { default: browser } = await getBrowser();
    const result = await browser.storage.sync.get(key);
    return result[key];
  }
  const raw = localStorage.getItem(`sg:${key}`);
  return raw !== null ? JSON.parse(raw) : undefined;
}

async function set(key: string, value: unknown): Promise<void> {
  if (isExtension) {
    const { default: browser } = await getBrowser();
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
    getBrowser().then(({ default: browser }) => {
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
