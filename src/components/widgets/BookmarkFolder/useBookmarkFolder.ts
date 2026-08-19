import { useState, useEffect, useCallback } from 'react';
import type { BmNode } from './bookmarks.mock';
import { MOCK_TREE, flattenNodes, findNode } from './bookmarks.mock';
import { isExtensionEnv, isScreenshotMode, hasBookmarksPermission, requestBookmarksPermission } from '../../../lib/permissions';
import { openLink } from '../../../lib/openLink';

async function getBrowser() {
  const { default: browser } = await import('webextension-polyfill');
  return browser;
}

export function useBookmarkFolder() {
  // null = still checking; true/false once resolved. Only meaningful in an
  // extension env — outside one (dev/browser preview) it stays false and
  // mock data is used unconditionally, since there's no bookmarks API at all.
  const [granted, setGranted] = useState<boolean | null>(isExtensionEnv ? null : false);

  useEffect(() => {
    if (!isExtensionEnv) return;
    let cancelled = false;
    hasBookmarksPermission()
      .then(g => { if (!cancelled) setGranted(g); })
      .catch(() => { if (!cancelled) setGranted(false); });
    return () => { cancelled = true; };
  }, []);

  const requestAccess = useCallback(async () => {
    const ok = await requestBookmarksPermission();
    setGranted(ok);
    return ok;
  }, []);

  // Mock data is normally a dev/preview stand-in only — inside the real
  // extension we don't fabricate a fake bookmark tree, since that's
  // indistinguishable from someone's actual bookmarks and defeats the point
  // of the permission prompt. Screenshot Mode is the deliberate exception:
  // it exists specifically so store screenshots can be taken from a real
  // loaded extension without exposing the user's actual bookmarks.
  const canUseRealBookmarks = isExtensionEnv && granted === true && !isScreenshotMode();
  const checkingPermission  = isExtensionEnv && granted === null && !isScreenshotMode();
  const needsPermission     = isExtensionEnv && granted === false && !isScreenshotMode();
  const useMockData = !isExtensionEnv || isScreenshotMode();

  async function getChildren(folderId: string): Promise<BmNode[]> {
    if (canUseRealBookmarks) {
      const browser = await getBrowser();
      return browser.bookmarks.getChildren(folderId) as Promise<BmNode[]>;
    }
    if (useMockData) return findNode(folderId, MOCK_TREE)?.children ?? [];
    return [];
  }

  async function search(query: string): Promise<BmNode[]> {
    if (canUseRealBookmarks) {
      const browser = await getBrowser();
      return browser.bookmarks.search(query) as Promise<BmNode[]>;
    }
    if (useMockData) {
      const q = query.toLowerCase();
      return flattenNodes(MOCK_TREE).filter(n =>
        !n.children &&
        (n.title.toLowerCase().includes(q) || (n.url ?? '').toLowerCase().includes(q))
      );
    }
    return [];
  }

  async function getNode(nodeId: string): Promise<BmNode | null> {
    if (canUseRealBookmarks) {
      try {
        const browser = await getBrowser();
        const results = await browser.bookmarks.get(nodeId);
        return (results[0] as BmNode) ?? null;
      } catch {
        return null;
      }
    }
    if (useMockData) return findNode(nodeId, MOCK_TREE);
    return null;
  }

  async function getTree(): Promise<BmNode[]> {
    if (canUseRealBookmarks) {
      const browser = await getBrowser();
      return browser.bookmarks.getTree() as Promise<BmNode[]>;
    }
    if (useMockData) return MOCK_TREE;
    return [];
  }

  async function openUrl(url: string): Promise<void> {
    await openLink(url);
  }

  // Stable primitive for effect dependency arrays — lets widgets/settings
  // re-fetch once a permission request resolves mid-session instead of only
  // ever fetching once on mount (when it may still have been unresolved).
  const permissionState = checkingPermission ? 'checking' : canUseRealBookmarks ? 'granted' : 'denied';

  return {
    getChildren, search, getNode, getTree, openUrl,
    isMock: useMockData,
    checkingPermission,
    needsPermission,
    requestAccess,
    permissionState,
  };
}
