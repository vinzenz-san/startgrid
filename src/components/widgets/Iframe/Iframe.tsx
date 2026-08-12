import type { IframeData } from '../../../types/widget';
import { SettingsRow } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { useEditMode } from '../../../contexts/EditModeContext';
import { normalizeUrl } from '../../../lib/urlUtils';
import './Iframe.css';

// ── Settings ───────────────────────────────────────────────────────────────

interface SettingsProps {
  data:         IframeData;
  onUpdateData: (patch: Partial<IframeData>) => void;
}

export function IframeSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();

  return (
    <div className="sg-iframe-settings" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.iframe.url')}>
        <input
          className="sg-form-input"
          placeholder="example.com"
          value={data.url ?? ''}
          onChange={e => onUpdateData({ url: e.target.value || undefined })}
          onBlur={e => {
            const normalized = normalizeUrl(e.target.value);
            if (normalized !== (data.url ?? null)) onUpdateData({ url: normalized ?? undefined });
          }}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        />
      </SettingsRow>
      <p className="sg-form-hint">{t('widget.iframe.hint')}</p>
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────

interface Props {
  data: IframeData;
}

export default function Iframe({ data }: Props) {
  const { t } = useSettings();
  const { isEditMode } = useEditMode();

  if (!data.url) {
    return (
      <div className="sg-iframe-empty">
        <span className="sg-iframe-empty-icon">🌐</span>
        <span className="sg-iframe-empty-text">{t('widget.iframe.noUrl')}</span>
      </div>
    );
  }

  return (
    <div className="sg-iframe-wrap">
      <iframe
        className="sg-iframe-frame"
        src={data.url}
        title={t('widget.iframe.title')}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
      />
      {/* An iframe is its own browsing context — pointer events over it never
          reach react-grid-layout's drag handlers on the parent page at all,
          so dragging this widget in edit mode would be impossible without
          this overlay stealing pointer events back while editing. */}
      {isEditMode && <div className="sg-iframe-edit-overlay" />}
    </div>
  );
}
