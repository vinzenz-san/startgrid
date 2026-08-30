// ── Persistent widget data (stored in browser.storage.sync) ──────────────────

export interface GmailFeedData {
  maxResults: number;   // 1–25, default 8 — client-side display cap; the feed
                         // itself returns every unread message, uncapped
  accountEmail: string; // Gmail address to match against the browser's logged-in
                         // Google sessions — see lib/gmailFeed.ts
}

// ── API-mirroring types ─────────────────────────────────────────────────────
// Mirrors the shape of an <entry> in Gmail's undocumented Atom feed:
//   GET https://mail.google.com/mail/u/{index}/feed/atom/

export interface GmailMessage {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  date: string;    // ISO-8601
  link: string;
  preview: string; // short snippet from the feed entry's <summary>
}

// ── Hook state ────────────────────────────────────────────────────────────────

export type GmailFeedStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error'
  | 'no-permission'     // host permission for mail.google.com not granted yet
  | 'no-account'        // accountEmail not configured yet
  | 'account-mismatch'  // accountEmail isn't among the browser's logged-in sessions
  | 'unknown-format';   // a session responded but its feed title didn't parse —
                         // Google may have changed the (undocumented) format

export interface GmailFeedState {
  status: GmailFeedStatus;
  messages: GmailMessage[];
  error: string | null;
  lastRefreshed: Date | null;
  isStale: boolean;
}
