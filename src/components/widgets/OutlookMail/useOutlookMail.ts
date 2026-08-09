import { useState, useCallback, useRef } from 'react';
import type { OutlookMailState, MailMessage } from './outlookMail.types';
import { getValidMsToken } from '../../../lib/msAuth';
import { storageLocal } from '../../../lib/storageLocal';
import { isScreenshotMode } from '../../../lib/permissions';

interface MessagesCache {
  messages: MailMessage[];
  fetchedAt: number;
}

function cacheKey(unreadOnly: boolean): string {
  return `sg:mail:cache:outlook:${unreadOnly}`;
}

// ── Real Microsoft Graph fetch ────────────────────────────────────────────────
// Calls:
//   GET https://graph.microsoft.com/v1.0/me/messages
//     ?$top=N&$orderby=receivedDateTime desc
//     &$select=subject,from,receivedDateTime,isRead,bodyPreview,webLink
//     [&$filter=isRead eq false]

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

interface RawGraphMessage {
  id: string;
  subject: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime: string;
  isRead: boolean;
  bodyPreview: string;
  webLink: string;
}

interface RawMessageList {
  value?: RawGraphMessage[];
  error?: { code: string; message: string };
}

function mapGraphMessage(raw: RawGraphMessage): MailMessage {
  return {
    id: raw.id,
    subject: raw.subject || '(No subject)',
    fromName: raw.from?.emailAddress?.name || raw.from?.emailAddress?.address || '',
    fromAddress: raw.from?.emailAddress?.address || '',
    receivedDateTime: raw.receivedDateTime,
    isRead: raw.isRead,
    bodyPreview: raw.bodyPreview || '',
    webLink: raw.webLink,
  };
}

async function fetchMessages(token: string, maxResults: number, unreadOnly: boolean): Promise<MailMessage[]> {
  const url = new URL(`${GRAPH_BASE}/me/messages`);
  url.searchParams.set('$top', String(maxResults));
  url.searchParams.set('$orderby', 'receivedDateTime desc');
  url.searchParams.set('$select', 'subject,from,receivedDateTime,isRead,bodyPreview,webLink');
  if (unreadOnly) url.searchParams.set('$filter', 'isRead eq false');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`Mail fetch failed: ${res.status}`);

  const data = await res.json() as RawMessageList;
  if (data.error) throw new Error(data.error.message);
  return (data.value ?? []).map(mapGraphMessage);
}

// ── Mock data — used in dev mode when extension APIs are unavailable ───────────

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const BASE_LINK = 'https://outlook.office.com/mail/inbox/id';

const MOCK_MESSAGES: MailMessage[] = [
  { id: 'omsg_001', subject: 'Q3 planning doc — please review', fromName: 'Anna Keller', fromAddress: 'anna.keller@example.com',
    receivedDateTime: minutesAgo(12), isRead: false, bodyPreview: 'Hey, could you take a look at the attached doc before Thursday...', webLink: BASE_LINK },
  { id: 'omsg_002', subject: 'Re: Invoice #4471', fromName: 'Billing', fromAddress: 'billing@vendor.com',
    receivedDateTime: minutesAgo(58), isRead: false, bodyPreview: 'Thanks for your payment. Attached is the receipt for your records.', webLink: BASE_LINK },
  { id: 'omsg_003', subject: 'Team lunch Friday?', fromName: 'Marco Diaz', fromAddress: 'marco.diaz@example.com',
    receivedDateTime: minutesAgo(190), isRead: true, bodyPreview: 'Thinking about that new place downtown, anyone in?', webLink: BASE_LINK },
  { id: 'omsg_004', subject: 'Your subscription renews soon', fromName: 'Notifications', fromAddress: 'no-reply@service.com',
    receivedDateTime: minutesAgo(720), isRead: true, bodyPreview: 'Your plan will renew automatically on the 30th.', webLink: BASE_LINK },
];

async function fetchMockMessages(unreadOnly: boolean): Promise<MailMessage[]> {
  await new Promise(r => setTimeout(r, 650));
  return unreadOnly ? MOCK_MESSAGES.filter(m => !m.isRead) : MOCK_MESSAGES;
}

const isExtension = typeof chrome !== 'undefined' && !!chrome.storage;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOutlookMail() {
  const [state, setState] = useState<OutlookMailState>({
    status: 'idle',
    messages: [],
    error: null,
    lastRefreshed: null,
    isStale: false,
  });

  const fetchingRef = useRef(false);

  const refresh = useCallback(async (maxResults = 8, unreadOnly = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setState(s => ({ ...s, status: 'loading', error: null }));

    try {
      let messages: MailMessage[];

      if (!isExtension || isScreenshotMode()) {
        messages = await fetchMockMessages(unreadOnly);
      } else {
        const token = await getValidMsToken();
        if (!token) {
          setState(s => ({ ...s, status: 'unauthenticated', error: null }));
          return;
        }
        try {
          messages = await fetchMessages(token, maxResults, unreadOnly);
        } catch (err) {
          if (err instanceof Error && err.message === 'UNAUTHORIZED') {
            setState(s => ({ ...s, status: 'unauthenticated', error: null }));
            return;
          }
          throw err;
        }
      }

      setState({
        status: 'success',
        messages,
        error: null,
        lastRefreshed: new Date(),
        isStale: false,
      });
      const cache: MessagesCache = { messages, fetchedAt: Date.now() };
      storageLocal.set(cacheKey(unreadOnly), cache);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load mail';
      // Fall back to the last cached messages rather than a bare error when
      // one exists — same reasoning as useWeather.ts/useRssFeed.ts.
      const cached = await storageLocal.get(cacheKey(unreadOnly));
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
