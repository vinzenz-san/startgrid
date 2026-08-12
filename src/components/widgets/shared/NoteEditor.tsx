import ActionButton from '../../shared/Form/ActionButton';
import { useSettings } from '../../../contexts/SettingsContext';
import './NoteEditor.css';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  fontSize: number | string;
}

/** Raw-markdown editor shared by ObsidianDaily and ObsidianNote — edits and
 *  writes back the whole note, ignoring any section/task display filters the
 *  widget applies when just reading (see those widgets for why). */
export default function NoteEditor({ value, onChange, onSave, onCancel, saving, fontSize }: Props) {
  const { t } = useSettings();

  return (
    <div className="sg-note-editor-wrap">
      <textarea
        className="sg-note-editor"
        style={{ fontSize }}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={saving}
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onDragStart={e => e.stopPropagation()}
      />
      <div className="sg-note-editor-actions">
        <ActionButton onClick={onSave} variant="ghost" fullWidth={false} disabled={saving}>
          {t('widget.obsidian.save')}
        </ActionButton>
        <ActionButton onClick={onCancel} variant="ghost" fullWidth={false} disabled={saving}>
          {t('widget.obsidian.cancel')}
        </ActionButton>
      </div>
    </div>
  );
}
