import { useState, useEffect, useCallback } from 'react';
// Type-only import — erased at build time, so this doesn't defeat the lazy
// runtime `await import('webextension-polyfill')` used below. Needed because
// the package's .d.ts uses `export = Browser` (a namespace), which dynamic
// `import('webextension-polyfill').default` typing doesn't resolve cleanly.
import type Browser from 'webextension-polyfill';
import {
  checkIsMsConnected,
  connectMicrosoft,
  disconnectMicrosoft,
  getConnectedMsEmail,
} from '../lib/msAuth';
import { isExtension } from '../lib/storage';

const STORAGE_KEY = 'sg_ms_auth';

export interface MsAuthState {
  isConnected: boolean;
  isConnecting: boolean;
  email: string | undefined;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Global Microsoft OAuth connection state, backed by `storage.local` rather
 * than per-widget state — listens for `storage.onChanged` so connecting or
 * disconnecting from one widget's settings immediately reflects in every
 * other mounted widget that reads this hook, without a shared context.
 */
export function useMsAuth(): MsAuthState {
  const [isConnected,  setIsConnected]  = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [email,        setEmail]        = useState<string | undefined>(undefined);
  const [error,        setError]        = useState<string | null>(null);

  // Read initial auth state from storage on mount
  useEffect(() => {
    let cancelled = false;

    checkIsMsConnected().then(connected => {
      if (cancelled) return;
      setIsConnected(connected);
      if (connected) getConnectedMsEmail().then(email => {
        if (cancelled) return;
        setEmail(email);
      });
    });

    // React to storage changes from any other widget / tab that triggers
    // connect() or disconnect() — keeps all mounted widgets in sync without
    // a shared React context.
    let browser: Browser.Browser | null = null;

    const listener = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    ) => {
      if (!(STORAGE_KEY in changes)) return;
      const hasToken = changes[STORAGE_KEY].newValue != null;
      setIsConnected(hasToken);
      if (!hasToken) setEmail(undefined);
    };

    if (isExtension) {
      import('webextension-polyfill').then(({ default: b }) => {
        if (cancelled) return;
        browser = b;
        browser.storage.local.onChanged.addListener(listener);
      });
    }

    return () => {
      cancelled = true;
      browser?.storage.local.onChanged.removeListener(listener);
    };
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectMicrosoft();
      setIsConnected(true);
      getConnectedMsEmail().then(setEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectMicrosoft();
    setIsConnected(false);
    setEmail(undefined);
  }, []);

  return { isConnected, isConnecting, email, error, connect, disconnect };
}
