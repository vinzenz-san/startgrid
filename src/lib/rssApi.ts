// Minimal RSS 2.0 / Atom parser via the browser's native DOMParser — no new
// dependency for what's a fairly small subset of either format (title, link,
// publish date, description). Same philosophy as lib/obsidianMarkdown.ts's
// hand-rolled Markdown subset over pulling in a full library.
//
// Feeds are fetched through the shared Cloudflare Worker (worker/api-proxy.ts's
// /rss route), not directly — most feeds send no CORS headers, so a direct
// browser fetch fails for the majority of real-world feed URLs.

const MEDIA_PROXY_URL = ((import.meta.env.APP_MEDIA_PROXY_URL || '') as string).replace(/\/$/, '');

export interface FeedItem {
  title: string;
  link: string;
  publishedAt?: string; // ISO-8601, when the feed provides a parseable date
  description?: string;
}

export interface ParsedFeed {
  feedTitle?: string;
  items: FeedItem[];
}

// Some feeds HTML-escape their text content on top of the XML escaping —
// sometimes more than once (e.g. "&amp;amp;#8217;" in the source, which the
// XML parser only unwraps one level of, leaving "&#8217;" or even
// "&amp;#8217;" literally in textContent). Keep decoding via an HTML parse
// until a pass changes nothing, capped so a pathological feed can't loop forever.
function decodeEntities(str: string): string {
  let prev = str;
  for (let i = 0; i < 5; i++) {
    const next = new DOMParser().parseFromString(prev, 'text/html').documentElement.textContent ?? prev;
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

function text(el: Element | null | undefined): string | undefined {
  const t = el?.textContent?.trim();
  return t ? decodeEntities(t) : undefined;
}

// Both RSS <pubDate> (RFC 822) and Atom <published>/<updated> (RFC 3339) parse
// fine via the Date constructor — normalize to ISO or drop if unparseable.
function normalizeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function parseAtomLink(entry: Element): string {
  // Atom <link> is a self-closing element with an href attribute, not text
  // content — prefer rel="alternate" (or no rel, which defaults to alternate)
  // over rel="self"/"enclosure".
  const links = Array.from(entry.getElementsByTagName('link'));
  const alt = links.find(l => !l.getAttribute('rel') || l.getAttribute('rel') === 'alternate');
  return alt?.getAttribute('href') ?? links[0]?.getAttribute('href') ?? '';
}

export function parseFeed(xmlText: string): ParsedFeed {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Feed is not valid XML');
  }

  const channel = doc.querySelector('rss > channel');
  if (channel) {
    const items = Array.from(channel.querySelectorAll(':scope > item')).map((item): FeedItem => ({
      title: text(item.querySelector('title')) ?? '(untitled)',
      link: text(item.querySelector('link')) ?? '',
      publishedAt: normalizeDate(text(item.querySelector('pubDate'))),
      description: text(item.querySelector('description')),
    }));
    return { feedTitle: text(channel.querySelector(':scope > title')), items };
  }

  const feed = doc.querySelector('feed');
  if (feed) {
    const items = Array.from(feed.querySelectorAll(':scope > entry')).map((entry): FeedItem => ({
      title: text(entry.querySelector('title')) ?? '(untitled)',
      link: parseAtomLink(entry),
      publishedAt: normalizeDate(text(entry.querySelector('published')) ?? text(entry.querySelector('updated'))),
      description: text(entry.querySelector('summary')) ?? text(entry.querySelector('content')),
    }));
    return { feedTitle: text(feed.querySelector(':scope > title')), items };
  }

  throw new Error('Unrecognized feed format (not RSS 2.0 or Atom)');
}

// res.text() decodes as UTF-8 unless the HTTP Content-Type header itself
// declares a charset — it never looks at the XML prolog's own encoding
// attribute. Plenty of real feeds (older CMSes especially) ship ISO-8859-1/
// windows-1252 bytes with only the prolog naming it, so decoding blind as
// UTF-8 turns every accented character into U+FFFD. Read the raw bytes
// instead and pick a decoder from whichever source actually says something.
function decodeXml(buf: ArrayBuffer, contentType: string | null): string {
  // The prolog is always plain ASCII where it matters, so a cheap latin1
  // peek at the first bytes is enough to read it regardless of the real
  // encoding — no need to guess right before we can find out what to guess.
  const head = new TextDecoder('windows-1252').decode(buf.slice(0, 200));
  const declared = /<\?xml[^>]*\sencoding=["']([\w-]+)["']/i.exec(head)?.[1];
  const headerCharset = /charset=([\w-]+)/i.exec(contentType ?? '')?.[1];
  const charset = (headerCharset || declared || 'utf-8').toLowerCase();

  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    // Unknown/unsupported label (e.g. a typo'd charset) — UTF-8 is still the
    // best fallback guess for a modern feed.
    return new TextDecoder('utf-8').decode(buf);
  }
}

export async function fetchFeed(feedUrl: string): Promise<ParsedFeed> {
  if (!MEDIA_PROXY_URL) {
    throw new Error('Feed proxy not configured (APP_MEDIA_PROXY_URL unset)');
  }
  const res = await fetch(`${MEDIA_PROXY_URL}/rss?url=${encodeURIComponent(feedUrl)}`);
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  const xmlText = decodeXml(await res.arrayBuffer(), res.headers.get('Content-Type'));
  return parseFeed(xmlText);
}
