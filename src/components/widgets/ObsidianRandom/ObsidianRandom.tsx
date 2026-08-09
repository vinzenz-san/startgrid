import { useEffect, useMemo, useRef } from 'react';
import type { ObsidianRandomData } from '../../../types/widget';
import { useObsidianRandom, firstLines } from './useObsidianRandom';
import { useObsidian } from '../../../hooks/useObsidian';
import { SettingsRow, Dropdown, SettingsSwitch, SettingsSlider, ActionButton } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { isScreenshotMode } from '../../../lib/permissions';
import { vaultPathToTitle } from '../../../lib/obsidianPath';
import { openInObsidian } from '../../../lib/obsidianApi';
import { clearVaultIndex } from '../../../lib/obsidianIndex';
import MarkdownView from '../shared/MarkdownView';
import ObsidianConnect from '../shared/ObsidianConnect';
import ObsidianStatus from '../shared/ObsidianStatus';
import { IconObsidian, IconShuffle, IconOpenExternal, SkeletonRow } from '../shared/ObsidianIcons';
import '../shared/obsidian.css';
import './ObsidianRandom.css';

function parseExcludes(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// ── Settings ──────────────────────────────────────────────────────────────────

interface SettingsProps {
  data:         ObsidianRandomData;
  onUpdateData: (patch: Partial<ObsidianRandomData>) => void;
}

export function ObsidianRandomSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();

  return (
    <div className="sg-obs-settings" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.obsidianRandom.refreshOn')}>
        <Dropdown
          options={[
            { value: 'load',   label: t('widget.obsidianRandom.refreshLoad') },
            { value: 'manual', label: t('widget.obsidianRandom.refreshManual') },
          ]}
          value={data.refreshOn ?? 'load'}
          onChange={v => onUpdateData({ refreshOn: v as 'load' | 'manual' })}
        />
      </SettingsRow>

      <SettingsRow label={t('widget.obsidianRandom.excludeFolders')}>
        <input
          className="sg-obs-input"
          placeholder="Templates, Archive"
          value={(data.excludeFolders ?? []).join(', ')}
          onChange={e => onUpdateData({ excludeFolders: parseExcludes(e.target.value) })}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        />
      </SettingsRow>
      <p className="sg-obs-hint">{t('widget.obsidianRandom.excludeHint')}</p>

      <SettingsRow label={t('widget.obsidianRandom.showExcerpt')}>
        <SettingsSwitch
          checked={data.showExcerpt ?? false}
          onChange={v => onUpdateData({ showExcerpt: v })}
        />
      </SettingsRow>

      <SettingsSlider
        label={t('widget.obsidianRandom.excerptLines')}
        min={1} max={12} step={1}
        value={data.excerptLines ?? 4}
        onChange={v => onUpdateData({ excerptLines: v })}
        valueFormatter={v => String(v)}
      />

      <SettingsSlider
        label={t('widget.obsidianRandom.fontSize')}
        value={data.fontSize ?? 13}
        min={9}
        max={20}
        step={1}
        valueFormatter={v => `${v}px`}
        onChange={v => onUpdateData({ fontSize: v })}
      />

      <ActionButton variant="ghost" onClick={() => void clearVaultIndex()}>
        {t('widget.obsidianRandom.rebuildIndex')}
      </ActionButton>
      <p className="sg-obs-hint">{t('widget.obsidianRandom.indexHint')}</p>

      <div className="sg-cal-settings-divider"/>
      <ObsidianConnect />
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

interface Props {
  data: ObsidianRandomData;
}

export default function ObsidianRandom({ data }: Props) {
  const { t } = useSettings();
  const { isReady, checking } = useObsidian();
  const { status, path, blocks, errorCode, truncated, shuffle, isMock } = useObsidianRandom();

  const excludes = useMemo(() => data.excludeFolders ?? [], [data.excludeFolders]);
  // Only auto-pick once per mount. Without this a settings change would
  // reshuffle the note out from under the user mid-read.
  const pickedRef = useRef(false);

  useEffect(() => {
    if (checking || pickedRef.current) return;
    if (!isMock && !isReady) return;
    if ((data.refreshOn ?? 'load') !== 'load') return;
    pickedRef.current = true;
    void shuffle(excludes);
  }, [checking, isReady, isMock, data.refreshOn, excludes, shuffle]);

  const isBusy        = status === 'indexing' || status === 'loading';
  const notConfigured = !isMock && !checking && !isReady;

  const excerpt = data.showExcerpt ? firstLines(blocks, data.excerptLines ?? 4) : '';

  return (
    <div className="sg-cal">
      <div className="sg-cal-header">
        <div className="sg-cal-title">
          <IconObsidian/>
          <span>{path ? vaultPathToTitle(path) : t('widget.obsidianRandom.title')}</span>
        </div>
        <div className="sg-obsr-actions">
          {isReady && path && (
            <button
              className="sg-cal-refresh"
              onClick={() => void openInObsidian(path).catch(() => {})}
              title={t('widget.obsidianRandom.openInObsidian')}
              aria-label={t('widget.obsidianRandom.openInObsidian')}
            >
              <IconOpenExternal/>
            </button>
          )}
          <button
            className="sg-cal-refresh"
            onClick={() => void shuffle(excludes)}
            disabled={isBusy || notConfigured}
            title={t('widget.obsidianRandom.shuffle')}
            aria-label={t('widget.obsidianRandom.shuffle')}
          >
            <IconShuffle/>
          </button>
        </div>
      </div>

      <div className="sg-cal-body sg-obsr sg-scroll-thin" style={{ fontSize: data.fontSize ?? 13 }}>
        {isMock && !isScreenshotMode() && <div className="sg-cal-preview-badge">{t('widget.obsidian.previewBadge')}</div>}

        {notConfigured ? (
          <ObsidianStatus code="NOT_CONFIGURED"/>
        ) : status === 'indexing' ? (
          <div className="sg-cal-empty">
            <span className="sg-cal-empty-text">{t('widget.obsidianRandom.indexing')}</span>
          </div>
        ) : status === 'loading' ? (
          <><SkeletonRow/><SkeletonRow/></>
        ) : status === 'error' && errorCode ? (
          <ObsidianStatus code={errorCode}/>
        ) : status === 'idle' ? (
          <div className="sg-obs-setup">
            <span className="sg-obs-setup-icon">🎲</span>
            <span className="sg-obs-setup-text">{t('widget.obsidianRandom.prompt')}</span>
            <button className="sg-cal-connect-btn" onClick={() => void shuffle(excludes)}>
              {t('widget.obsidianRandom.shuffle')}
            </button>
          </div>
        ) : (
          <>
            {truncated && (
              <div className="sg-obsr-truncated">{t('widget.obsidianRandom.truncated')}</div>
            )}
            <span className="sg-obsr-path">{path}</span>
            {excerpt
              ? <p className="sg-obsr-excerpt">{excerpt}</p>
              : <MarkdownView blocks={blocks}/>}
          </>
        )}
      </div>
    </div>
  );
}
