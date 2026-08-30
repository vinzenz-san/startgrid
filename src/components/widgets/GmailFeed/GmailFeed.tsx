import { useEffect, useState } from 'react';
import type { GmailFeedData } from '../../../types/widget';
import type { GmailMessage } from './gmailFeed.types';
import { useGmailFeed } from './useGmailFeed';
import { useGmailPermission } from '../../../hooks/useGmailPermission';
import { probeDefaultAccountEmail } from '../../../lib/gmailFeed';
import { SettingsRow, SettingsSlider, SettingsSwitch } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { isScreenshotMode } from '../../../lib/permissions';
import { LOCALES } from '../../../i18n';
import './GmailFeed.css';

const DEFAULT_MAX_RESULTS = 8;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string, locale: string, todayLabel: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return todayLabel;
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
// Generic envelope glyph in a Gmail-ish red, not the actual Gmail wordmark/logo
// — same trademark-avoidance approach as IconOutlookMail below.

function IconRefresh({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`sg-cal-icon-refresh${spinning ? ' spinning' : ''}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <polyline points="15,2.5 15,6.5 11,6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.7 10a6 6 0 1 1-1.4-6.2L15 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function IconGmail() {
  return (
    <svg className="sg-cal-logo-icon" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="4" width="18" height="12" rx="2" fill="#ea4335"/>
      <path d="M1 5.5 10 11l9-5.5" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconConnect() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="sg-cal-skeleton-group">
      <div className="sg-cal-skeleton-row">
        <div className="sg-cal-skeleton sg-cal-skeleton--time"/>
        <div className="sg-cal-skeleton sg-cal-skeleton--title"/>
      </div>
    </div>
  );
}

// ── Message row ───────────────────────────────────────────────────────────────
// Every entry in Gmail's feed is, by definition, unread — so unlike
// OutlookMail's MessageRow there's no read/unread toggle, just the always-on
// unread treatment (dot + bold sender).

function MessageRow({ message, locale, todayLabel, showPreview }: { message: GmailMessage; locale: string; todayLabel: string; showPreview: boolean }) {
  return (
    <a
      className="sg-gmail-item"
      href={message.link}
      title={message.subject}
      target="_blank"
      rel="noreferrer"
    >
      <div className="sg-gmail-item-top">
        <span className="sg-gmail-unread-dot" aria-hidden="true"/>
        <span className="sg-gmail-from">{message.fromName || message.fromAddress}</span>
        <span className="sg-gmail-time">{formatRelativeTime(message.date, locale, todayLabel)}</span>
      </div>
      <div className="sg-gmail-subject">{message.subject}</div>
      {showPreview && message.preview && <div className="sg-gmail-preview">{message.preview}</div>}
    </a>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

interface SettingsProps {
  data: GmailFeedData;
  onUpdateData: (patch: Partial<GmailFeedData>) => void;
}

export function GmailFeedSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const maxResults = data.maxResults ?? DEFAULT_MAX_RESULTS;
  const accountEmail = data.accountEmail ?? '';
  const showPreview = data.showPreview ?? true;
  const { hasPermission, checking, grantPermission } = useGmailPermission();
  const [suggestedEmail, setSuggestedEmail] = useState<string | null>(null);

  // Once permission is granted and no address is configured yet, probe u/0
  // once so the user can confirm rather than type the address by hand.
  useEffect(() => {
    if (!hasPermission || accountEmail || isScreenshotMode()) { setSuggestedEmail(null); return; }
    let cancelled = false;
    probeDefaultAccountEmail().then(email => { if (!cancelled) setSuggestedEmail(email); });
    return () => { cancelled = true; };
  }, [hasPermission, accountEmail]);

  return (
    <div className="sg-cal-settings" onClick={e => e.stopPropagation()}>
      <SettingsSlider
        label={t('widget.gmailFeed.maxResults')}
        min={1} max={25} step={1}
        value={maxResults}
        onChange={v => onUpdateData({ maxResults: v })}
        valueFormatter={v => String(v)}
        defaultValue={DEFAULT_MAX_RESULTS}
      />

      <p className="sg-obs-hint">{t('widget.gmailFeed.unreadOnlyNote')}</p>

      <SettingsRow label={t('widget.gmailFeed.showPreview')}>
        <SettingsSwitch checked={showPreview} onChange={v => onUpdateData({ showPreview: v })} />
      </SettingsRow>

      <SettingsRow label={t('widget.gmailFeed.accountEmail')}>
        <input
          className="sg-obs-input"
          type="text"
          placeholder="name"
          value={accountEmail}
          onChange={e => onUpdateData({ accountEmail: e.target.value.trim() })}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        />
      </SettingsRow>
      <p className="sg-obs-hint">{t('widget.gmailFeed.accountEmailHint')}</p>

      {!accountEmail && suggestedEmail && (
        <p className="sg-obs-hint">
          {t('widget.gmailFeed.suggestedFound', { email: suggestedEmail })}{' '}
          <button
            className="sg-cal-connect-btn"
            onClick={() => { onUpdateData({ accountEmail: suggestedEmail }); setSuggestedEmail(null); }}
          >
            {t('widget.gmailFeed.useSuggested')}
          </button>
        </p>
      )}

      <div className="sg-cal-settings-divider"/>

      <div className="sg-cal-settings-section">
        <span className="sg-cal-settings-label">{t('widget.gmailFeed.access')}</span>
        {hasPermission ? (
          <p className="sg-cal-account-email">{t('widget.gmailFeed.accessGranted')}</p>
        ) : (
          <>
            {/* Called straight from the click — lib/permissions.ts explains why
                nothing may be awaited before permissions.request() in Firefox. */}
            <button className="sg-cal-connect-btn" onClick={() => void grantPermission()} disabled={checking}>
              <IconConnect/> {t('widget.gmailFeed.grantAccess')}
            </button>
            <p className="sg-cal-connect-note">{t('widget.gmailFeed.grantNote')}</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

interface Props {
  data: GmailFeedData;
  onUpdateData: (patch: Partial<GmailFeedData>) => void;
}

export default function GmailFeed({ data }: Props) {
  const { t, language } = useSettings();
  const locale = LOCALES[language];
  const { status, messages, isStale, refresh, isMock } = useGmailFeed();
  const { hasPermission, grantPermission } = useGmailPermission();
  const maxResults = data.maxResults ?? DEFAULT_MAX_RESULTS;
  const accountEmail = data.accountEmail ?? '';
  const showPreview = data.showPreview ?? true;

  useEffect(() => { refresh(accountEmail); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(accountEmail); }, [hasPermission, accountEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = status === 'idle' || status === 'loading';
  const displayed = messages.slice(0, maxResults);

  return (
    <div className="sg-cal">
      <div className="sg-cal-header">
        <div className="sg-cal-title">
          <IconGmail/>
          <span>{t('widget.gmailFeed.inbox')}</span>
        </div>
        <button className="sg-cal-refresh" onClick={() => refresh(accountEmail)}
          disabled={isLoading || status === 'no-permission'} title={t('widget.gmailFeed.refresh')} aria-label={t('widget.gmailFeed.refreshAria')}>
          <IconRefresh spinning={isLoading}/>
        </button>
      </div>
      <div className="sg-cal-body sg-scroll-thin">
        {isMock && !isScreenshotMode() && (
          <div className="sg-cal-preview-badge">{t('widget.gmailFeed.previewBadge')}</div>
        )}
        {isStale && !isLoading && (
          <div className="sg-cal-stale-banner">{t('widget.gmailFeed.stale')}</div>
        )}
        {status === 'no-permission' ? (
          <div className="sg-cal-empty">
            <IconGmail/>
            <span className="sg-cal-empty-text">{t('widget.gmailFeed.connectPrompt')}</span>
            <button className="sg-cal-connect-btn" onClick={() => void grantPermission()}>
              <IconConnect/> {t('widget.gmailFeed.grantAccess')}
            </button>
          </div>
        ) : status === 'no-account' ? (
          <div className="sg-cal-empty">
            <span className="sg-cal-empty-icon">✎</span>
            <span className="sg-cal-empty-text">{t('widget.gmailFeed.noAccount')}</span>
          </div>
        ) : status === 'account-mismatch' ? (
          <div className="sg-cal-empty">
            <span className="sg-cal-empty-icon">⚠</span>
            <span className="sg-cal-empty-text">{t('widget.gmailFeed.accountMismatch', { email: accountEmail })}</span>
          </div>
        ) : status === 'unknown-format' ? (
          <div className="sg-cal-empty">
            <span className="sg-cal-empty-icon">⚠</span>
            <span className="sg-cal-empty-text">{t('widget.gmailFeed.unknownFormat')}</span>
          </div>
        ) : isLoading ? (
          <><SkeletonRow/><SkeletonRow/><SkeletonRow/></>
        ) : status === 'error' ? (
          <div className="sg-cal-empty">
            <span className="sg-cal-empty-icon">⚠</span>
            <span className="sg-cal-empty-text">{t('widget.gmailFeed.loadError')}</span>
          </div>
        ) : displayed.length === 0 ? (
          <div className="sg-cal-empty">
            <span className="sg-cal-empty-icon">✓</span>
            <span className="sg-cal-empty-text">{t('widget.gmailFeed.noMessages')}</span>
          </div>
        ) : (
          <div className="sg-gmail-list">
            {displayed.map(m => <MessageRow key={m.id} message={m} locale={locale} todayLabel={t('widget.gmailFeed.justNow')} showPreview={showPreview}/>)}
          </div>
        )}
      </div>
    </div>
  );
}
