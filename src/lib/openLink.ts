import type { MouseEvent } from 'react';
import { isExtensionEnv } from './permissions';

const ALLOWED_LINK_SCHEMES = new Set(['http:', 'https:', 'chrome:', 'chrome-extension:', 'moz-extension:']);

/** True if `url`'s scheme is safe to navigate to/open in a tab (blocks e.g. `javascript:`). */
export function isAllowedLinkUrl(url: string): boolean {
  try {
    return ALLOWED_LINK_SCHEMES.has(new URL(url, location.href).protocol);
  } catch { return false; }
}

/** Opens `url` in a tab. `background: true` mirrors native middle-click — a new tab that doesn't steal focus. */
export async function openLink(url: string, background = false): Promise<void> {
  if (!isAllowedLinkUrl(url)) return;
  if (isExtensionEnv) {
    const { default: browser } = await import('webextension-polyfill');
    await browser.tabs.create({ url, active: !background });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/** Wires native-like middle-click (opens `url` in a background tab) onto a non-anchor click target. Not a hook — safe to call anywhere, including inside a loop/map. */
export function middleClickHandlers(url: string | undefined | null) {
  return {
    onMouseDown: (e: MouseEvent) => {
      if (e.button !== 1 || !url) return;
      e.preventDefault();
      void openLink(url, true);
    },
  };
}
