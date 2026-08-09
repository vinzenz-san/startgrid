import { useEffect, useMemo, useState } from 'react';
import type { ObsidianNoteData } from '../../../types/widget';
import { useObsidianNote } from './useObsidianNote';
import { useObsidian } from '../../../hooks/useObsidian';
import { SettingsRow, SettingsSlider } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { isScreenshotMode } from '../../../lib/permissions';
import { normalizeVaultPath, vaultPathToTitle } from '../../../lib/obsidianPath';
import { sliceSection } from '../../../lib/obsidianMarkdown';
import { openInObsidian } from '../../../lib/obsidianApi';
import MarkdownView from '../shared/MarkdownView';
import NoteEditor from '../shared/NoteEditor';
import ObsidianConnect from '../shared/ObsidianConnect';
import ObsidianStatus from '../shared/ObsidianStatus';
import { IconObsidian, IconRefresh, IconOpenExternal, IconEdit, SkeletonRow } from '../shared/ObsidianIcons';
import '../shared/obsidian.css';
import './ObsidianNote.css';

// ── Settings ──────────────────────────────────────────────────────────────────

interface SettingsProps {
  data:         ObsidianNoteData;
  onUpdateData: (patch: Partial<ObsidianNoteData>) => void;
}

export function ObsidianNoteSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();

  return (
    <div className="sg-obs-settings" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.obsidianNote.path')}>
        <input
          className="sg-obs-input sg-obs-input--mono"
          placeholder="Notes/Shopping.md"
          value={data.path ?? ''}
          onChange={e => onUpdateData({ path: e.target.value || undefined })}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        />
      </SettingsRow>

      <SettingsRow label={t('widget.obsidianNote.section')}>
        <input
          className="sg-obs-input"
          placeholder={t('widget.obsidianNote.sectionPlaceholder')}
          value={data.sectionHeading ?? ''}
          onChange={e => onUpdateData({ sectionHeading: e.target.value || undefined })}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        />
      </SettingsRow>

      <SettingsSlider
        label={t('widget.obsidianNote.maxLines')}
        min={0} max={60} step={1}
        value={data.maxLines ?? 0}
        onChange={v => onUpdateData({ maxLines: v || undefined })}
        valueFormatter={v => (v ? String(v) : t('widget.obsidianNote.noLimit'))}
      />

      <SettingsSlider
        label={t('widget.obsidianNote.refreshMinutes')}
        min={0} max={60} step={5}
        value={data.refreshMinutes ?? 0}
        onChange={v => onUpdateData({ refreshMinutes: v || undefined })}
        valueFormatter={v => (v ? `${v} min` : t('widget.obsidianNote.refreshOnLoad'))}
      />

      <SettingsSlider
        label={t('widget.obsidianNote.fontSize')}
        value={data.fontSize ?? 13}
        min={9}
        max={20}
        step={1}
        valueFormatter={v => `${v}px`}
        onChange={v => onUpdateData({ fontSize: v })}
      />

      <div className="sg-cal-settings-divider"/>
      <ObsidianConnect />
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

interface Props {
  data: ObsidianNoteData;
}

export default function ObsidianNote({ data }: Props) {
  const { t } = useSettings();
  const { isReady, checking } = useObsidian();
  const { status, source, blocks, errorCode, writing, staleConflict, isStale, refresh, saveEdit, isMock } = useObsidianNote();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const path = normalizeVaultPath(data.path ?? '');

  useEffect(() => {
    if (checking) return;
    if (!isMock && !isReady) return;
    void refresh(path);
  }, [checking, isReady, isMock, path, refresh]);

  // Optional polling — a pinned shopping list edited on a phone should catch up
  // without the user reaching for the refresh button.
  useEffect(() => {
    const minutes = data.refreshMinutes ?? 0;
    if (!minutes || !path || editing) return;
    if (!isMock && !isReady) return;
    const id = setInterval(() => void refresh(path), minutes * 60_000);
    return () => clearInterval(id);
  }, [data.refreshMinutes, path, isReady, isMock, refresh, editing]);

  const visible = useMemo(() => {
    let out = data.sectionHeading ? sliceSection(blocks, data.sectionHeading) : blocks;
    if (data.maxLines && data.maxLines > 0) out = out.slice(0, data.maxLines);
    return out;
  }, [blocks, data.sectionHeading, data.maxLines]);

  const isLoading     = status === 'idle' || status === 'loading';
  const notConfigured = !isMock && !checking && !isReady;

  return (
    <div className="sg-cal">
      <div className="sg-cal-header">
        <div className="sg-cal-title">
          <IconObsidian/>
          <span>{path ? vaultPathToTitle(path) : t('widget.obsidianNote.untitled')}</span>
        </div>
        <div className="sg-obsn-actions">
          {isReady && status === 'success' && !editing && (
            <button
              className="sg-cal-refresh"
              onClick={() => { setDraft(source); setEditing(true); }}
              title={t('widget.obsidian.edit')}
              aria-label={t('widget.obsidian.edit')}
            >
              <IconEdit/>
            </button>
          )}
          {isReady && path && !editing && (
            <button
              className="sg-cal-refresh"
              onClick={() => void openInObsidian(path).catch(() => {})}
              title={t('widget.obsidianNote.openInObsidian')}
              aria-label={t('widget.obsidianNote.openInObsidian')}
            >
              <IconOpenExternal/>
            </button>
          )}
          <button
            className="sg-cal-refresh"
            onClick={() => void refresh(path)}
            disabled={isLoading || notConfigured || editing}
            title={t('widget.obsidianNote.refresh')}
            aria-label={t('widget.obsidianNote.refresh')}
          >
            <IconRefresh spinning={isLoading}/>
          </button>
        </div>
      </div>

      <div className="sg-cal-body sg-obsn sg-scroll-thin" style={{ fontSize: data.fontSize ?? 13 }}>
        {isMock && !isScreenshotMode() && <div className="sg-cal-preview-badge">{t('widget.obsidian.previewBadge')}</div>}
        {isStale && !isLoading && <div className="sg-cal-stale-banner">{t('widget.obsidianNote.stale')}</div>}

        {editing ? (
          <NoteEditor
            value={draft}
            onChange={setDraft}
            saving={writing}
            fontSize={data.fontSize ?? 13}
            onCancel={() => setEditing(false)}
            onSave={() => void (async () => {
              await saveEdit(source, draft);
              setEditing(false);
            })()}
          />
        ) : notConfigured ? (
          <ObsidianStatus code="NOT_CONFIGURED"/>
        ) : !path ? (
          <ObsidianStatus code="NOT_CONFIGURED"/>
        ) : isLoading ? (
          <><SkeletonRow/><SkeletonRow/><SkeletonRow/></>
        ) : status === 'error' && errorCode ? (
          <ObsidianStatus code={errorCode}/>
        ) : visible.length === 0 ? (
          <div className="sg-cal-empty">
            <span className="sg-cal-empty-icon">📄</span>
            <span className="sg-cal-empty-text">{t('widget.obsidianNote.empty')}</span>
          </div>
        ) : (
          <>
            {staleConflict && (
              <div className="sg-obs-conflict">{t('widget.obsidian.editConflict')}</div>
            )}
            <MarkdownView blocks={visible}/>
          </>
        )}
      </div>
    </div>
  );
}
