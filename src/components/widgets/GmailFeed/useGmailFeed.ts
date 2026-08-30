import { useState, useCallback, useRef } from 'react';
import type { GmailFeedState, GmailMessage } from './gmailFeed.types';
import { fetchGmailMessages, normalizeGmailAddress, GmailAccountMismatchError, GmailUnknownFormatError } from '../../../lib/gmailFeed';
import { storageLocal } from '../../../lib/storageLocal';
import { isScreenshotMode, hasGmailHostPermission } from '../../../lib/permissions';

interface MessagesCache {
  messages: GmailMessage[];
  fetchedAt: number;
}

function cacheKey(accountEmail: string): string {
  return `sg:mail:cache:gmail:${normalizeGmailAddress(accountEmail)}`;
}

// ── Mock data — used in dev mode when extension APIs are unavailable ───────────

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const BASE_LINK = 'https://mail.google.com/mail/u/0/#inbox';

const MOCK_MESSAGES: GmailMessage[] = [
  { id: 'gmsg_001', subject: 'Your flight is tomorrow', fromName: 'Airline Notifications', fromAddress: 'no-reply@airline.example',
    date: minutesAgo(9), link: BASE_LINK, preview: 'Check in online now to save time at the airport. Your flight departs at...' },
  { id: 'gmsg_002', subject: 'Re: Project kickoff', fromName: 'Lena Fischer', fromAddress: 'lena.fischer@example.com',
    date: minutesAgo(47), link: BASE_LINK, preview: 'Sounds good, let’s sync tomorrow morning to go over the timeline...' },
  { id: 'gmsg_003', subject: 'Your receipt from Example Store', fromName: 'Example Store', fromAddress: 'receipts@example-store.com',
    date: minutesAgo(210), link: BASE_LINK, preview: 'Thank you for your order! Here is a summary of your purchase...' },
];

// No artificial delay — MOCK_MESSAGES is a static array, already known
// synchronously at import time.
async function fetchMockMessages(): Promise<GmailMessage[]> {
  return MOCK_MESSAGES;
}

const isExtension = typeof chrome !== 'undefined' && !!chrome.storage;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGmailFeed() {
  const [state, setState] = useState<GmailFeedState>({
    status: 'idle',
    messages: [],
    error: null,
    lastRefreshed: null,
    isStale: false,
  });

  const fetchingRef = useRef(false);

  const refresh = useCallback(async (accountEmail: string) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setState(s => ({ ...s, status: 'loading', error: null }));

    try {
      let messages: GmailMessage[];

      if (!isExtension || isScreenshotMode()) {
        messages = await fetchMockMessages();
      } else if (!(await hasGmailHostPermission())) {
        setState(s => ({ ...s, status: 'no-permission', error: null }));
        return;
      } else if (!accountEmail) {
        setState(s => ({ ...s, status: 'no-account', error: null }));
        return;
      } else {
        ({ messages } = await fetchGmailMessages(accountEmail));
      }

      setState({
        status: 'success',
        messages,
        error: null,
        lastRefreshed: new Date(),
        isStale: false,
      });
      if (accountEmail) {
        const cache: MessagesCache = { messages, fetchedAt: Date.now() };
        storageLocal.set(cacheKey(accountEmail), cache);
      }
    } catch (err) {
      if (err instanceof GmailAccountMismatchError) {
        setState(s => ({ ...s, status: 'account-mismatch', error: null }));
        return;
      }
      if (err instanceof GmailUnknownFormatError) {
        setState(s => ({ ...s, status: 'unknown-format', error: null }));
        return;
      }

      const message = err instanceof Error ? err.message : 'Failed to load mail';
      // Fall back to the last cached messages rather than a bare error when
      // one exists — same reasoning as useOutlookMail.ts/useRssFeed.ts.
      const cached = accountEmail ? await storageLocal.get(cacheKey(accountEmail)) : undefined;
      const c = cached as MessagesCache | undefined;
      if (c) {
        setState({ status: 'success', messages: c.messages, error: message, lastRefreshed: new Date(c.fetchedAt), isStale: true });
      } else {
        setState(s => ({ ...s, status: 'error', error: message, isStale: false }));
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  return { ...state, refresh, isMock: !isExtension || isScreenshotMode() };
}
