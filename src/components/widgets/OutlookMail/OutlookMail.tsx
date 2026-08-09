import { useEffect } from 'react';
import type { OutlookMailData } from '../../../types/widget';
import type { MailMessage } from './outlookMail.types';
import { useOutlookMail } from './useOutlookMail';
import { useMsAuth } from '../../../hooks/useMsAuth';
import { SettingsRow, SettingsSwitch } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { isScreenshotMode } from '../../../lib/permissions';
import { LOCALES } from '../../../i18n';
import './OutlookMail.css';

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

function IconRefresh({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`sg-cal-icon-refresh${spinning ? ' spinning' : ''}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <polyline points="15,2.5 15,6.5 11,6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.7 10a6 6 0 1 1-1.4-6.2L15 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function IconOutlookMail() {
  return (
    <svg className="sg-cal-logo-icon" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="4" width="18" height="12" rx="2" fill="#0078d4"/>
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

function IconDisconnect() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5 8h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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

function MessageRow({ message, locale, todayLabel }: { message: MailMessage; locale: string; todayLabel: string }) {
  return (
    <a
      className={`sg-omail-item${!message.isRead ? ' sg-omail-item--unread' : ''}`}
      href={message.webLink}
      title={message.subject}
      target="_blank"
      rel="noreferrer"
    >
      <div className="sg-omail-item-top">
        <span className={`sg-omail-unread-dot${message.isRead ? ' sg-omail-unread-dot--hidden' : ''}`} aria-hidden="true"/>
        <span className="sg-omail-from">{message.fromName}</span>
        <span className="sg-omail-time">{formatRelativeTime(message.receivedDateTime, locale, todayLabel)}</span>
      </div>
      <div className="sg-omail-subject">{message.subject}</div>
      <div className="sg-omail-preview">{message.bodyPreview}</div>
    </a>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

interface SettingsProps {
  data: OutlookMailData;
  onUpdateData: (patch: Partial<OutlookMailData>) => void;
}

export function OutlookMailSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const maxResults     = data.maxResults ?? 8;
  const showUnreadOnly = data.showUnreadOnly ?? false;
  const { isConnected, isConnecting, email, error, connect, disconnect } = useMsAuth();

  return (
    <div className="sg-cal-settings" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.outlookMail.maxResults')}>
        <div className="sg-cal-slider-wrap">
          {/* eslint-disable-next-line no-restricted-syntax -- pre-existing, not yet migrated to SettingsSlider (shared with Calendar/OutlookCalendar) */}
          <input type="range" min={1} max={25} value={maxResults}
            onChange={e => onUpdateData({ maxResults: Number(e.target.value) })}
            className="sg-cal-slider"/>
          <span className="sg-cal-slider-val">{maxResults}</span>
        </div>
      </SettingsRow>

      <SettingsRow label={t('widget.outlookMail.unreadOnly')}>
        <SettingsSwitch checked={showUnreadOnly} onChange={v => onUpdateData({ showUnreadOnly: v })} />
      </SettingsRow>

      <div className="sg-cal-settings-divider"/>

      <div className="sg-cal-settings-section">
        <span className="sg-cal-settings-label">{t('widget.outlookMail.msAccount')}</span>
        {isConnected ? (
          <>
            {email && <p className="sg-cal-account-email">{email}</p>}
            <button className="sg-cal-connect-btn sg-cal-connect-btn--disconnect" onClick={disconnect}>
              <IconDisconnect/> {t('widget.outlookMail.disconnect')}
            </button>
          </>
        ) : (
          <>
            <button className="sg-cal-connect-btn" onClick={connect} disabled={isConnecting}>
              <IconConnect/> {isConnecting ? t('widget.outlookMail.connecting') : t('widget.outlookMail.connect')}
            </button>
            {error && <p className="sg-cal-connect-error">{error}</p>}
            <p className="sg-cal-connect-note">{t('widget.outlookMail.grantNote')}</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

interface Props {
  data: OutlookMailData;
  onUpdateData: (patch: Partial<OutlookMailData>) => void;
}

export default function OutlookMail({ data }: Props) {
  const { t, language } = useSettings();
  const locale = LOCALES[language];
  const { status, messages, isStale, refresh, isMock } = useOutlookMail();
  const { isConnected, connect, isConnecting } = useMsAuth();
  const maxResults     = data.maxResults ?? 8;
  const showUnreadOnly = data.showUnreadOnly ?? false;

  useEffect(() => { refresh(maxResults, showUnreadOnly); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(maxResults, showUnreadOnly); }, [isConnected, maxResults, showUnreadOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading  = status === 'idle' || status === 'loading';
  const isUnauthed = status === 'unauthenticated';

  return (
    <div className="sg-cal">
      <div className="sg-cal-header">
        <div className="sg-cal-title">
          <IconOutlookMail/>
          <span>{t('widget.outlookMail.inbox')}</span>
        </div>
        <button className="sg-cal-refresh" onClick={() => refresh(maxResults, showUnreadOnly)}
          disabled={isLoading || isUnauthed} title={t('widget.outlookMail.refresh')} aria-label={t('widget.outlookMail.refreshAria')}>
          <IconRefresh spinning={isLoading}/>
        </button>
      </div>
      <div className="sg-cal-body sg-scroll-thin">
        {isMock && !isScreenshotMode() && (
          <div className="sg-cal-preview-badge">{t('widget.outlookMail.previewBadge')}</div>
        )}
        {isStale && !isLoading && (
          <div className="sg-cal-stale-banner">{t('widget.outlookMail.stale')}</div>
        )}
        {isUnauthed ? (
          <div className="sg-cal-empty">
            <IconOutlookMail/>
            <span className="sg-cal-empty-text">{t('widget.outlookMail.connectPrompt')}</span>
            <button className="sg-cal-connect-btn" onClick={connect} disabled={isConnecting}>
              <IconConnect/> {isConnecting ? t('widget.outlookMail.connecting') : t('widget.outlookMail.connect')}
            </button>
          </div>
        ) : isLoading ? (
          <><SkeletonRow/><SkeletonRow/><SkeletonRow/></>
        ) : status === 'error' ? (
          <div className="sg-cal-empty">
            <span className="sg-cal-empty-icon">⚠</span>
            <span className="sg-cal-empty-text">{t('widget.outlookMail.loadError')}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="sg-cal-empty">
            <span className="sg-cal-empty-icon">✓</span>
            <span className="sg-cal-empty-text">{t('widget.outlookMail.noMessages')}</span>
          </div>
        ) : (
          <div className="sg-omail-list">
            {messages.map(m => <MessageRow key={m.id} message={m} locale={locale} todayLabel={t('widget.outlookMail.justNow')}/>)}
          </div>
        )}
      </div>
    </div>
  );
}
