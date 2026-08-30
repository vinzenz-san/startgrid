import { useState, useEffect, useCallback } from 'react';
// Type-only import — erased at build time, so it doesn't defeat the lazy
// runtime `await import('webextension-polyfill')` below. Same reasoning as
// useMsAuth.ts/useObsidian.ts: the package's .d.ts uses `export = Browser`.
import type Browser from 'webextension-polyfill';
import {
  isExtensionEnv,
  hasGmailHostPermission,
  requestGmailHostPermission,
  removeGmailHostPermission,
} from '../lib/permissions';

export interface GmailPermissionState {
  hasPermission: boolean;
  checking: boolean;
  /** Must be called straight from a click handler — see lib/permissions.ts. */
  grantPermission: () => Promise<boolean>;
  revokePermission: () => Promise<void>;
}

/**
 * Global mail.google.com host-permission state — one grant for the whole
 * extension, not per-widget. Mirrors the permission half of useObsidian
 * (loopback host permission) rather than useMsAuth (OAuth token): there's no
 * account connection record here, just a permission the user either has or
 * doesn't, plus a listener so it stays in sync if it's revoked from the
 * browser's own add-on manager.
 */
export function useGmailPermission(): GmailPermissionState {
  const [hasPermission, setHasPermission] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    hasGmailHostPermission().then(perm => {
      if (cancelled) return;
      setHasPermission(perm);
      setChecking(false);
    });

    if (!isExtensionEnv) return () => { cancelled = true; };

    let browser: Browser.Browser | null = null;
    const onPermissionChange = () => {
      void hasGmailHostPermission().then(setHasPermission);
    };

    void import('webextension-polyfill').then(({ default: b }) => {
      if (cancelled) return;
      browser = b;
      browser.permissions.onAdded.addListener(onPermissionChange);
      browser.permissions.onRemoved.addListener(onPermissionChange);
    });

    return () => {
      cancelled = true;
      browser?.permissions.onAdded.removeListener(onPermissionChange);
      browser?.permissions.onRemoved.removeListener(onPermissionChange);
    };
  }, []);

  const grantPermission = useCallback(() => {
    return requestGmailHostPermission().then(granted => {
      setHasPermission(granted);
      return granted;
    });
  }, []);

  const revokePermission = useCallback(async () => {
    await removeGmailHostPermission();
    setHasPermission(await hasGmailHostPermission());
  }, []);

  return { hasPermission, checking, grantPermission, revokePermission };
}
