import { useEffect, useRef, useState } from 'react';
import type { NotesData } from '../../../types/widget';
import { SettingsRow, Dropdown } from '../../shared/Form';
import { storageLocal } from '../../../lib/storageLocal';
import { useSettings } from '../../../contexts/SettingsContext';
import { scaledFontSize } from '../../../lib/displayStyle';
import './Notes.css';

const DEFAULT_FONT_SIZE = 13;

const SYNC_CHAR_LIMIT = 4_000;

// ── Settings ───────────────────────────────────────────────────────────────

interface SettingsProps {
  data:         NotesData;
  onUpdateData: (patch: Partial<NotesData>) => void;
  widgetId?:    string;
}

export function NotesSettings({ data, onUpdateData, widgetId }: SettingsProps) {
  const { t } = useSettings();
  const storageMode = data.storageMode ?? 'local';

  const handleModeChange = async (newMode: 'local' | 'synced') => {
    if (!widgetId) { onUpdateData({ storageMode: newMode }); return; }
    const localKey = `note_content_${widgetId}`;

    if (newMode === 'local') {
      // Migrate sync content → local, then clear from sync
      if (data.content) await storageLocal.set(localKey, data.content);
      onUpdateData({ storageMode: 'local', content: '' });
    } else {
      // Migrate local content → sync (capped at limit)
      const saved = (await storageLocal.get(localKey) as string) ?? '';
      onUpdateData({ storageMode: 'synced', content: saved.slice(0, SYNC_CHAR_LIMIT) });
    }
  };

  return (
    <div className="sg-notes-settings" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.notes.storage')}>
        <Dropdown
          options={[{ value: 'local', label: t('widget.notes.storageLocal') }, { value: 'synced', label: t('widget.notes.storageCloud') }]}
          value={storageMode}
          onChange={v => handleModeChange(v as 'local' | 'synced')}
        />
      </SettingsRow>
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────

interface Props {
  data:         NotesData;
  onUpdateData: (patch: Partial<NotesData>) => void;
  widgetId?:    string;
}

export default function Notes({ data, onUpdateData, widgetId }: Props) {
  const { t } = useSettings();
  const storageMode = data.storageMode ?? 'local';
  const localKey    = widgetId ? `note_content_${widgetId}` : null;

  const [localContent, setLocalContent] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from local storage; auto-migrate existing sync content on first use
  useEffect(() => {
    if (storageMode !== 'local' || !localKey) return;
    storageLocal.get(localKey).then((stored) => {
      const saved = (stored as string) ?? '';
      if (saved) {
        setLocalContent(saved);
      } else if (data.content) {
        // One-time migration: content was previously stored in sync
        storageLocal.set(localKey, data.content);
        setLocalContent(data.content);
        onUpdateData({ content: '' });
      }
    });
    // Intentionally omit data.content / onUpdateData — only re-run on mode/key change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageMode, localKey]);

  // Flush pending local write on unmount
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const handleChange = (text: string) => {
    if (storageMode === 'local') {
      setLocalContent(text);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (localKey) {
        saveTimer.current = setTimeout(() => storageLocal.set(localKey, text), 400);
      }
    } else {
      if (text.length > SYNC_CHAR_LIMIT) return;
      onUpdateData({ content: text });
    }
  };

  const content  = storageMode === 'local' ? localContent : (data.content ?? '');
  const charsPct = storageMode === 'synced' ? content.length / SYNC_CHAR_LIMIT : 0;

  return (
    <div className="sg-notes-wrap">
      <textarea
        className="sg-notes sg-scroll-thin"
        style={{ fontSize: scaledFontSize(DEFAULT_FONT_SIZE) }}
        value={content}
        placeholder={t('widget.notes.placeholder')}
        spellCheck={false}
        maxLength={storageMode === 'synced' ? SYNC_CHAR_LIMIT : undefined}
        onChange={e => handleChange(e.target.value)}
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onDragStart={e => e.stopPropagation()}
      />
      {storageMode === 'synced' && (
        <div className={`sg-notes-counter${charsPct >= 0.9 ? ' sg-notes-counter--warn' : ''}`}>
          {content.length.toLocaleString()} / {SYNC_CHAR_LIMIT.toLocaleString()}
        </div>
      )}
    </div>
  );
}
