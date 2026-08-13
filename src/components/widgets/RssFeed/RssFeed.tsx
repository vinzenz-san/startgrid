import { useEffect, useState } from 'react';
import type { RssFeedData } from '../../../types/widget';
import { SettingsRow, SettingsSlider, SettingsSwitch, Dropdown, ActionButton } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { useRssFeed } from '../../../hooks/useRssFeed';
import { isExtensionEnv } from '../../../lib/permissions';
import { useClickDragGuard } from '../../../lib/clickDragGuard';
import type { TranslationKey } from '../../../i18n';
import './RssFeed.css';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

async function openUrl(url: string): Promise<void> {
  if (isExtensionEnv) {
    const { default: browser } = await import('webextension-polyfill');
    await browser.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

function relativeTime(iso: string | undefined, t: Translate): string | undefined {
  if (!iso) return undefined;
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return t('widget.rssFeed.justNow');
  if (minutes < 60) return t('widget.rssFeed.minutesAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('widget.rssFeed.hoursAgo', { count: hours });
  const days = Math.round(hours / 24);
  return t('widget.rssFeed.daysAgo', { count: days });
}

// ── Settings ───────────────────────────────────────────────────────────────

interface SettingsProps {
  data: RssFeedData;
  onUpdateData: (patch: Partial<RssFeedData>) => void;
}

const REFRESH_OPTIONS = [15, 30, 60, 120] as const;
const DEFAULT_MAX_ITEMS = 8;

export function RssFeedSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const [urlDraft, setUrlDraft] = useState(data.feedUrl ?? '');
  const maxItems = data.maxItems ?? DEFAULT_MAX_ITEMS;
  const showDescription = data.showDescription ?? false;
  const refreshIntervalMin = data.refreshIntervalMin ?? 30;

  function commitUrl() {
    const trimmed = urlDraft.trim();
    if (trimmed !== (data.feedUrl ?? '')) onUpdateData({ feedUrl: trimmed || undefined, feedTitle: undefined });
  }

  return (
    <>
      <SettingsRow label={t('widget.rssFeed.feedUrl')}>
        <input
          className="sg-form-input"
          type="text"
          placeholder={t('widget.rssFeed.feedUrlPlaceholder')}
          value={urlDraft}
          onChange={e => setUrlDraft(e.target.value)}
          onBlur={commitUrl}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </SettingsRow>

      <SettingsSlider
        label={t('widget.rssFeed.maxItems')}
        value={maxItems}
        onChange={v => onUpdateData({ maxItems: v })}
        min={3}
        max={20}
        step={1}
        valueFormatter={v => String(v)}
        defaultValue={DEFAULT_MAX_ITEMS}
      />

      <SettingsRow label={t('widget.rssFeed.showDescription')}>
        <SettingsSwitch checked={showDescription} onChange={v => onUpdateData({ showDescription: v })} />
      </SettingsRow>

      <SettingsRow label={t('widget.rssFeed.refreshInterval')}>
        <Dropdown
          options={REFRESH_OPTIONS.map(min => ({
            value: String(min),
            label: min < 60 ? t('widget.rssFeed.refreshMinutes', { count: min }) : t('widget.rssFeed.refreshHours', { count: min / 60 }),
          }))}
          value={String(refreshIntervalMin)}
          onChange={v => onUpdateData({ refreshIntervalMin: Number(v) })}
        />
      </SettingsRow>
    </>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

interface Props {
  data: RssFeedData;
  onUpdateData: (patch: Partial<RssFeedData>) => void;
}

export default function RssFeed({ data, onUpdateData }: Props) {
  const { t } = useSettings();
  const maxItems = data.maxItems ?? DEFAULT_MAX_ITEMS;
  const showDescription = data.showDescription ?? false;
  const { onPointerDown, guardClick } = useClickDragGuard();

  const { status, items, feedTitle, error, isStale, isDemo, refetch } = useRssFeed({
    feedUrl: data.feedUrl,
    refreshIntervalMin: data.refreshIntervalMin,
  });

  // Cache the feed's own title on the widget's stored data once resolved, so
  // the dynamic title (registry.tsx's resolveDynamicTitle) survives reloads
  // without needing a fetch first.
  useEffect(() => {
    if (feedTitle && feedTitle !== data.feedTitle) {
      onUpdateData({ feedTitle });
    }
  }, [feedTitle, data.feedTitle, onUpdateData]);

  if (!data.feedUrl) {
    return (
      <div className="sg-rss-empty">
        <span className="sg-rss-empty-icon">📰</span>
        <span className="sg-rss-empty-text">{t('widget.rssFeed.noFeed')}</span>
      </div>
    );
  }

  if (status === 'loading' && items.length === 0) {
    return <div className="sg-rss-empty"><span className="sg-rss-empty-text">{t('widget.rssFeed.loading')}</span></div>;
  }

  if (status === 'error') {
    return (
      <div className="sg-rss-empty">
        <span className="sg-rss-empty-text">{t('widget.rssFeed.error')}</span>
        {error && <span className="sg-rss-empty-detail">{error}</span>}
        <ActionButton variant="ghost" onClick={refetch}>{t('widget.rssFeed.refreshNow')}</ActionButton>
      </div>
    );
  }

  return (
    <ul className="sg-rss-list sg-scroll-thin">
      {isStale && (
        <li className="sg-rss-stale-banner">
          {t('widget.rssFeed.stale')}
        </li>
      )}
      {isDemo && (
        <li className="sg-rss-stale-banner">
          {t('widget.rssFeed.demo')}
        </li>
      )}
      {items.slice(0, maxItems).map((item, i) => (
        <li key={item.link || `${item.title}-${i}`} className="sg-rss-item">
          <button
            className="sg-rss-item-link"
            onPointerDown={onPointerDown}
            onClick={e => guardClick(e, () => item.link && openUrl(item.link))}
          >
            <span className="sg-rss-item-title">{item.title}</span>
            {showDescription && item.description && (
              <span className="sg-rss-item-desc">{item.description}</span>
            )}
            {item.publishedAt && (
              <span className="sg-rss-item-time">{relativeTime(item.publishedAt, t)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
