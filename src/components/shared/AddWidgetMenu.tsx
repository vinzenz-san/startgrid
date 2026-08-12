import { useEffect, useRef, useState } from 'react';
import { useWidgets } from '../../contexts/WidgetContext';
import { useGridConfig } from '../../contexts/GridConfigContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useEditHistory } from '../../contexts/EditHistoryContext';
import { WIDGET_REGISTRY, WIDGET_MENU_TYPES, WIDGET_TYPE_LABEL_KEYS } from '../widgets/registry';
import { buildNewWidget } from '../../lib/gridUtils';
import type { WidgetType } from '../../types/widget';
import './AddWidgetMenu.css';

interface Props { className?: string; }

// Shared by the Settings Sidebar's "Widgets" section and Grid.tsx's floating
// edit-mode button — same toggle + dropdown list, same add-widget logic,
// just a different `className` for positioning/sizing at each call site.
export default function AddWidgetMenu({ className }: Props) {
  const { widgets, addWidget } = useWidgets();
  const { gridConfig } = useGridConfig();
  const { pushHistory } = useEditHistory();
  const { developerOptionsEnabled, t } = useSettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true });
  }, [open]);

  const handleAdd = (type: WidgetType) => {
    pushHistory('editHistory.addedWidget');
    addWidget(buildNewWidget(widgets, gridConfig.columns, type));
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`sg-widget-add-section${className ? ` ${className}` : ''}`}>
      <button
        className={`sg-widget-add-toggle${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {t('widgets.addWidget')}
      </button>
      {open && (
        <div className="sg-widget-add-list">
          {WIDGET_MENU_TYPES
            .filter(type => !WIDGET_REGISTRY[type].devOnly || developerOptionsEnabled)
            .map(type => {
              const { icon } = WIDGET_REGISTRY[type];
              return (
                <button key={type} className="sg-widget-add-item" onClick={() => handleAdd(type)}>
                  <span className="sg-widget-add-icon">{icon}</span>
                  {t(WIDGET_TYPE_LABEL_KEYS[type])}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
