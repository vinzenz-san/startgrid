// Fetches and parses Gmail's undocumented per-account Atom feed via the
// browser's own session cookies — no OAuth. Same hand-rolled DOMParser
// philosophy as lib/rssApi.ts's parseFeed, applied to a single, fixed feed
// shape instead of a general RSS/Atom subset.
//
// Multiple Google accounts can be logged in at once in the browser, but the
// widget is configured for exactly one (GmailFeedData.accountEmail). The feed
// endpoint is per-session-index (`u/0`, `u/1`, …), and that index is NOT
// stable — it depends on browser sign-in order, not the account's address.
// So every fetch has to (1) find which index currently belongs to the
// configured address, by reading the address back out of that index's own
// feed <title> ("Gmail - Inbox for user@example.com" — undocumented, may
// change without notice), and (2) parse messages only once matched.
//
// See lib/permissions.ts for the host-permission gate this all sits behind.

import { storageLocal } from './storageLocal';
import type { GmailMessage } from '../components/widgets/GmailFeed/gmailFeed.types';

const MAX_ACCOUNT_INDEX = 5; // more concurrently logged-in Google accounts than this is rare

// Google treats gmail.com and the legacy googlemail.com domain as the same
// mailbox, and the feed title can report either one regardless of which form
// the user typed — so match on the local part alone, with gmail.com/
// googlemail.com normalized away. A bare username (no "@" at all) is also
// accepted as shorthand for "@gmail.com".
export function normalizeGmailAddress(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  if (at === -1) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return domain === 'gmail.com' || domain === 'googlemail.com' ? local : trimmed;
}

function matchedIndexKey(accountEmail: string): string {
  return `sg:gmail:matchedIndex:${normalizeGmailAddress(accountEmail)}`;
}

export class GmailAccountMismatchError extends Error {
  constructor(public readonly accountEmail: string) {
    super(`Gmail account ${accountEmail} is not logged in in this browser`);
  }
}

export class GmailUnknownFormatError extends Error {
  constructor() {
    super('Could not determine the Gmail account from the feed — unrecognized title format');
  }
}

// ── Probing a single session index ──────────────────────────────────────────

interface AccountProbe {
  index: number;
  email: string | null; // null = feed responded but the title didn't parse
  xml: string;
}

function extractFeedTitleEmail(xml: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const title = doc.querySelector('feed > title')?.textContent?.trim() ?? '';
  return /for\s+([^\s<]+@[^\s<]+)$/i.exec(title)?.[1] ?? null;
}

async function probeAccount(index: number): Promise<AccountProbe | null> {
  try {
    const res = await fetch(`https://mail.google.com/mail/u/${index}/feed/atom/`, { credentials: 'include' });
    if (!res.ok) return null; // no logged-in session at this index
    const xml = await res.text();
    if (!xml.includes('<feed')) return null; // login/HTML page, not a session at this index
    return { index, email: extractFeedTitleEmail(xml), xml };
  } catch {
    return null; // network error, or (unexpectedly) CORS — treat this index as unavailable
  }
}

// ── Account matching ─────────────────────────────────────────────────────────

interface GmailMatchResult {
  matchedIndex: number;
  xml: string;
}

/**
 * Finds the browser session index whose feed title's email matches
 * `accountEmail`. Tries the last-known index first (cached in storage.local);
 * on a miss it probes u/0..u/MAX_ACCOUNT_INDEX in parallel and re-caches
 * whichever index matches.
 */
async function findGmailAccount(accountEmail: string): Promise<GmailMatchResult> {
  const target = normalizeGmailAddress(accountEmail);

  const cachedIndex = await storageLocal.get(matchedIndexKey(accountEmail)) as number | undefined;
  if (cachedIndex !== undefined) {
    const probe = await probeAccount(cachedIndex);
    if (probe?.email && normalizeGmailAddress(probe.email) === target) {
      return { matchedIndex: cachedIndex, xml: probe.xml };
    }
  }

  const indices = Array.from({ length: MAX_ACCOUNT_INDEX + 1 }, (_, i) => i);
  const probes = await Promise.all(indices.map(probeAccount));
  const found = probes.filter((p): p is AccountProbe => p !== null);

  const match = found.find(p => p.email && normalizeGmailAddress(p.email) === target);
  if (match) {
    await storageLocal.set(matchedIndexKey(accountEmail), match.index);
    return { matchedIndex: match.index, xml: match.xml };
  }

  // At least one session's title parsed to a (different) address — a confident
  // negative, not a parsing problem.
  if (found.some(p => p.email !== null)) throw new GmailAccountMismatchError(accountEmail);

  // Sessions responded but none could be read for an email — the undocumented
  // title format likely changed; don't misreport this as "not logged in".
  if (found.length > 0) throw new GmailUnknownFormatError();

  // Nothing responded at any index.
  throw new GmailAccountMismatchError(accountEmail);
}

/** Probes only u/0 — used by Settings to suggest an address when none is configured yet. */
export async function probeDefaultAccountEmail(): Promise<string | null> {
  const probe = await probeAccount(0);
  return probe?.email ?? null;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function normalizeDate(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function parseGmailAtom(xml: string): GmailMessage[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return Array.from(doc.querySelectorAll('feed > entry')).map((entry): GmailMessage => ({
    id: entry.querySelector('id')?.textContent?.trim() || crypto.randomUUID(),
    subject: entry.querySelector('title')?.textContent?.trim() || '(no subject)',
    fromName: entry.querySelector('author > name')?.textContent?.trim() || '',
    fromAddress: entry.querySelector('author > email')?.textContent?.trim() || '',
    date: normalizeDate(entry.querySelector('issued')?.textContent ?? entry.querySelector('modified')?.textContent) ?? new Date().toISOString(),
    link: entry.querySelector('link')?.getAttribute('href') ?? '',
    preview: entry.querySelector('summary')?.textContent?.trim() || '',
  }));
}

/** Fetches and parses the unread-mail Atom feed for the browser session matching `accountEmail`. */
export async function fetchGmailMessages(accountEmail: string): Promise<{ messages: GmailMessage[]; matchedIndex: number }> {
  const { matchedIndex, xml } = await findGmailAccount(accountEmail);
  return { messages: parseGmailAtom(xml), matchedIndex };
}
