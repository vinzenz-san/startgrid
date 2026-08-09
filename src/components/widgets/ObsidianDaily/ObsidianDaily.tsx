import { useEffect, useMemo, useState } from 'react';
import type { ObsidianDailyData } from '../../../types/widget';
import { useObsidianDaily } from './useObsidianDaily';
import { useObsidian } from '../../../hooks/useObsidian';
import { SettingsRow, SettingsSwitch, SettingsSlider } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { isScreenshotMode } from '../../../lib/permissions';
import { DEFAULT_DAILY_TEMPLATE, resolvePathTemplate, vaultPathToTitle } from '../../../lib/obsidianPath';
import { sliceSection, type MdBlock } from '../../../lib/obsidianMarkdown';
import MarkdownView from '../shared/MarkdownView';
import NoteEditor from '../shared/NoteEditor';
import ObsidianConnect from '../shared/ObsidianConnect';
import ObsidianStatus from '../shared/ObsidianStatus';
import { IconObsidian, IconRefresh, IconOpenExternal, IconEdit, SkeletonRow } from '../shared/ObsidianIcons';
import { openInObsidian } from '../../../lib/obsidianApi';
import '../shared/obsidian.css';
import './ObsidianDaily.css';

// ── Filtering ─────────────────────────────────────────────────────────────────

/** Apply the widget's display settings to a parsed note. Exported for the
 *  same reason composeCapture is: it's pure and worth being able to reason
 *  about independently of the component. */
export function applyDailyFilters(blocks: MdBlock[], data: ObsidianDailyData): MdBlock[] {
  let out = data.sectionHeading ? sliceSection(blocks, data.sectionHeading) : blocks;
  if (data.tasksOnly) out = out.filter(b => b.kind === 'task');
  if (data.showChecked === false) out = out.filter(b => !(b.kind === 'task' && b.checked));
  if (data.maxLines && data.maxLines > 0) out = out.slice(0, data.maxLines);
  return out;
}

// ── Settings ──────────────────────────────────────────────────────────────────

interface SettingsProps {
  data:         ObsidianDailyData;
  onUpdateData: (patch: Partial<ObsidianDailyData>) => void;
}

export function ObsidianDailySettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const template = data.pathTemplate || DEFAULT_DAILY_TEMPLATE;

  return (
    <div className="sg-obs-settings" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.obsidianDaily.pathTemplate')}>
        <input
          className="sg-obs-input sg-obs-input--mono"
          placeholder={DEFAULT_DAILY_TEMPLATE}
          value={data.pathTemplate ?? ''}
          onChange={e => onUpdateData({ pathTemplate: e.target.value || undefined })}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        />
      </SettingsRow>
      <p className="sg-obs-hint">
        {t('widget.obsidianDaily.templateHint')} <code>{resolvePathTemplate(template)}</code>
      </p>

      <SettingsRow label={t('widget.obsidianDaily.section')}>
        <input
          className="sg-obs-input"
          placeholder={t('widget.obsidianDaily.sectionPlaceholder')}
          value={data.sectionHeading ?? ''}
          onChange={e => onUpdateData({ sectionHeading: e.target.value || undefined })}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        />
      </SettingsRow>

      <SettingsRow label={t('widget.obsidianDaily.tasksOnly')}>
        <SettingsSwitch checked={data.tasksOnly ?? false} onChange={v => onUpdateData({ tasksOnly: v })} />
      </SettingsRow>

      <SettingsRow label={t('widget.obsidianDaily.showChecked')}>
        <SettingsSwitch checked={data.showChecked ?? true} onChange={v => onUpdateData({ showChecked: v })} />
      </SettingsRow>

      <SettingsSlider
        label={t('widget.obsidianDaily.maxLines')}
        min={0} max={50} step={1}
        value={data.maxLines ?? 0}
        onChange={v => onUpdateData({ maxLines: v || undefined })}
        valueFormatter={v => (v ? String(v) : t('widget.obsidianDaily.noLimit'))}
      />

      <SettingsSlider
        label={t('widget.obsidianDaily.fontSize')}
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
  data: ObsidianDailyData;
}

export default function ObsidianDaily({ data }: Props) {
  const { t } = useSettings();
  const { isReady, checking } = useObsidian();
  const {
    status, source, blocks, errorCode, writing, staleConflict, isStale,
    refresh, toggleTask, createNote, saveEdit, isMock,
  } = useObsidianDaily();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const template = data.pathTemplate || DEFAULT_DAILY_TEMPLATE;
  // Resolved once per render pass rather than memoised on the date: a tab left
  // open across midnight picks up the new day on its next refresh.
  const path = resolvePathTemplate(template);

  useEffect(() => {
    if (checking) return;
    if (!isMock && !isReady) return;
    void refresh(path);
  }, [checking, isReady, isMock, path, refresh]);

  const visible = useMemo(() => applyDailyFilters(blocks, data), [blocks, data]);

  const isLoading = status === 'idle' || status === 'loading';

  // Not configured at all yet — the connection block lives in settings, so the
  // body just points there.
  const notConfigured = !isMock && !checking && !isReady;

  return (
    <div className="sg-cal">
      <div className="sg-cal-header">
        <div className="sg-cal-title">
          <IconObsidian/>
          <span>{vaultPathToTitle(path)}</span>
        </div>
        <div className="sg-obsd-actions">
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
          {isReady && status !== 'error' && !editing && (
            <button
              className="sg-cal-refresh"
              onClick={() => void openInObsidian(path).catch(() => {})}
              title={t('widget.obsidianDaily.openInObsidian')}
              aria-label={t('widget.obsidianDaily.openInObsidian')}
            >
              <IconOpenExternal/>
            </button>
          )}
          <button
            className="sg-cal-refresh"
            onClick={() => void refresh(path)}
            disabled={isLoading || notConfigured || editing}
            title={t('widget.obsidianDaily.refresh')}
            aria-label={t('widget.obsidianDaily.refresh')}
          >
            <IconRefresh spinning={isLoading || writing}/>
          </button>
        </div>
      </div>

      <div className="sg-cal-body sg-obsd sg-scroll-thin" style={{ fontSize: data.fontSize ?? 13 }}>
        {isMock && !isScreenshotMode() && <div className="sg-cal-preview-badge">{t('widget.obsidian.previewBadge')}</div>}
        {isStale && !isLoading && <div className="sg-cal-stale-banner">{t('widget.obsidianDaily.stale')}</div>}

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
        ) : isLoading ? (
          <><SkeletonRow/><SkeletonRow/><SkeletonRow/></>
        ) : status === 'error' && errorCode ? (
          <ObsidianStatus
            code={errorCode}
            action={errorCode === 'NOT_FOUND' ? {
              label: t('widget.obsidianDaily.createNote'),
              onClick: () => void createNote(path),
              disabled: writing,
            } : undefined}
          />
        ) : visible.length === 0 ? (
          <div className="sg-cal-empty">
            <span className="sg-cal-empty-icon">✓</span>
            <span className="sg-cal-empty-text">{t('widget.obsidianDaily.empty')}</span>
          </div>
        ) : (
          <>
            {staleConflict && (
              <div className="sg-obs-conflict">{t('widget.obsidianDaily.conflict')}</div>
            )}
            <MarkdownView blocks={visible} onToggleTask={toggleTask} busy={writing}/>
          </>
        )}
      </div>
    </div>
  );
}
