import type { FeedItem } from '../../../lib/rssApi';

// Used only in the web preview (docs/preview — no host/extension environment
// to reliably reach the real proxy Worker from every visitor's browser/CORS
// setup) when a live fetch fails, so a demo visitor always sees a populated,
// realistic widget instead of an error state. Never used inside the actual
// installed extension — see useRssFeed.ts's isExtensionEnv gate.
export const MOCK_FEED_TITLE = 'StartGrid Sample Feed';

export const MOCK_FEED_ITEMS: FeedItem[] = [
  {
    title: 'This is sample content — the real feed couldn’t be reached',
    link: 'https://vinzenz-dev.de/startgrid',
    description: 'The hosted preview can’t always reach every RSS feed’s server directly. Install StartGrid to fetch your own feeds live.',
    publishedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    title: 'Add any feed URL once installed',
    link: 'https://vinzenz-dev.de/startgrid',
    description: 'This widget supports RSS 2.0 and Atom feeds — paste a feed URL into its settings to try your own.',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    title: 'Layouts, widgets, and themes are all live in this preview',
    link: 'https://vinzenz-dev.de/startgrid',
    description: 'Everything else here reflects the real extension — this feed’s content is the one exception.',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
];
