import type { GoogleServiceAppId } from '../types/widget';
import type { TranslationKey } from '../i18n';

// Google's own branding CDN — the same icons Google uses to represent these
// products across its own properties. Hotlinked (never downloaded/re-hosted),
// same trademark-risk profile as the favicon services below, just targeted
// instead of guessed at via a generic domain lookup.
const brandIcon = (slug: string) => `https://www.gstatic.com/images/branding/product/1x/${slug}_48dp.png`;

export interface GoogleServiceAppDef {
  id:       GoogleServiceAppId;
  labelKey: TranslationKey;
  domain:   string; // fallback favicon-chain lookup if brandIconUrl 404s
  brandIconUrl: string; // preferred icon source — tried before the favicon chain
  url:      string; // base app URL, no authuser param
  curated:  boolean; // true = part of the default 10-app set
}

export const GOOGLE_SERVICE_APPS: GoogleServiceAppDef[] = [
  { id: 'gmail',     labelKey: 'widget.googleServices.app.gmail',     domain: 'mail.google.com',     brandIconUrl: brandIcon('gmail'),     url: 'https://mail.google.com/mail/',              curated: true },
  { id: 'calendar',  labelKey: 'widget.googleServices.app.calendar',  domain: 'calendar.google.com', brandIconUrl: brandIcon('calendar'),  url: 'https://calendar.google.com/calendar/',      curated: true },
  { id: 'drive',     labelKey: 'widget.googleServices.app.drive',     domain: 'drive.google.com',    brandIconUrl: brandIcon('drive'),     url: 'https://drive.google.com/drive/',            curated: true },
  { id: 'docs',      labelKey: 'widget.googleServices.app.docs',      domain: 'docs.google.com',     brandIconUrl: brandIcon('docs'),      url: 'https://docs.google.com/document/u/0/',      curated: true },
  { id: 'sheets',    labelKey: 'widget.googleServices.app.sheets',    domain: 'docs.google.com',     brandIconUrl: brandIcon('sheets'),    url: 'https://docs.google.com/spreadsheets/u/0/',  curated: true },
  { id: 'slides',    labelKey: 'widget.googleServices.app.slides',    domain: 'docs.google.com',     brandIconUrl: brandIcon('slides'),    url: 'https://docs.google.com/presentation/u/0/',  curated: true },
  { id: 'photos',    labelKey: 'widget.googleServices.app.photos',    domain: 'photos.google.com',   brandIconUrl: brandIcon('photos'),    url: 'https://photos.google.com/',                 curated: true },
  { id: 'maps',      labelKey: 'widget.googleServices.app.maps',      domain: 'maps.google.com',     brandIconUrl: brandIcon('maps'),      url: 'https://maps.google.com/',                   curated: true },
  { id: 'meet',      labelKey: 'widget.googleServices.app.meet',      domain: 'meet.google.com',     brandIconUrl: brandIcon('meet'),      url: 'https://meet.google.com/',                   curated: true },
  { id: 'keep',      labelKey: 'widget.googleServices.app.keep',      domain: 'keep.google.com',     brandIconUrl: brandIcon('keep'),      url: 'https://keep.google.com/',                   curated: true },

  { id: 'forms',     labelKey: 'widget.googleServices.app.forms',     domain: 'docs.google.com',      brandIconUrl: brandIcon('forms'),     url: 'https://docs.google.com/forms/u/0/',  curated: false },
  { id: 'contacts',  labelKey: 'widget.googleServices.app.contacts',  domain: 'contacts.google.com',  brandIconUrl: brandIcon('contacts'),  url: 'https://contacts.google.com/',        curated: false },
  { id: 'translate', labelKey: 'widget.googleServices.app.translate', domain: 'translate.google.com', brandIconUrl: brandIcon('translate'), url: 'https://translate.google.com/',       curated: false },
  { id: 'news',      labelKey: 'widget.googleServices.app.news',      domain: 'news.google.com',      brandIconUrl: brandIcon('news'),      url: 'https://news.google.com/',            curated: false },
  { id: 'chat',      labelKey: 'widget.googleServices.app.chat',      domain: 'chat.google.com',      brandIconUrl: brandIcon('chat'),      url: 'https://chat.google.com/',            curated: false },
  { id: 'youtube',   labelKey: 'widget.googleServices.app.youtube',   domain: 'youtube.com',          brandIconUrl: brandIcon('youtube'),   url: 'https://www.youtube.com/',            curated: false },
  { id: 'earth',     labelKey: 'widget.googleServices.app.earth',     domain: 'earth.google.com',     brandIconUrl: brandIcon('earth'),     url: 'https://earth.google.com/web/',       curated: false },
  { id: 'account',   labelKey: 'widget.googleServices.app.account',   domain: 'myaccount.google.com', brandIconUrl: brandIcon('googleg'),   url: 'https://myaccount.google.com/',       curated: false },
];

export const DEFAULT_GOOGLE_SERVICE_APPS: GoogleServiceAppId[] =
  GOOGLE_SERVICE_APPS.filter(a => a.curated).map(a => a.id);

export function getGoogleServiceApp(id: GoogleServiceAppId): GoogleServiceAppDef | undefined {
  return GOOGLE_SERVICE_APPS.find(a => a.id === id);
}

/** Bare usernames default to @gmail.com; anything already containing '@'
 *  (including @googlemail.com) is kept as-is. Not verified against any
 *  browser session — just used to build the `authuser` deep-link param. */
export function normalizeGoogleAccount(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.includes('@') ? trimmed : `${trimmed}@gmail.com`;
}

export function buildGoogleServiceUrl(app: GoogleServiceAppDef, account: string | undefined): string {
  if (!account) return app.url;
  const sep = app.url.includes('?') ? '&' : '?';
  return `${app.url}${sep}authuser=${encodeURIComponent(account)}`;
}
