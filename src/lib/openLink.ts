import type { MouseEvent } from 'react';
import { isExtensionEnv } from './permissions';

/** Opens `url` in a tab. `background: true` mirrors native middle-click — a new tab that doesn't steal focus. */
export async function openLink(url: string, background = false): Promise<void> {
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
