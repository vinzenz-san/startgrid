import { getCompactor, type Layout } from 'react-grid-layout';
import type { Widget } from '../types/widget';

/** Vertical auto-compaction during live drag, with displacement allowed:
 *  getCompactor('vertical', false, false) = vertical compaction on, no
 *  overlap, preventCollision off — dragging into another widget pushes it
 *  out of the way, and the vertical compactor pulls displaced widgets back
 *  up into their own gaps as the dragged item moves past them, producing
 *  the "rubber-band" elastic-snap feel (Renewed Tab's WidgetGrid.tsx uses
 *  the same compactType: "vertical" + preventCollision: false pairing for
 *  its non-fullPage mode). A final commit still runs through vertical
 *  compaction too — a widget dropped in an open gap gets pulled up to fill
 *  it rather than staying at the exact dropped row, which is the deliberate
 *  trade this compaction mode makes for the elastic-drag feel; the
 *  drag-start snapshot + revert-on-return-to-origin logic in RGLGrid.tsx is
 *  what stops a cancelled drag from leaving neighbors permanently shifted. */
export const dragCompactor = getCompactor('vertical', false, false);

/** StartGrid's stored `{ col, row }` is 1-based; RGL's `{ x, y }` is 0-based.
 *  This is the only place that conversion happens — everything else (storage,
 *  gridUtils' collision/placement helpers) keeps using the 1-based fields. */
export function widgetsToLayout(widgets: Widget[]): Layout {
  return widgets.map(w => ({ i: w.id, x: w.col - 1, y: w.row - 1, w: w.w, h: w.h }));
}

interface WidgetPositionChange { id: string; col: number; row: number; w: number; h: number; }

/** RGL's onLayoutChange fires with the full layout on every drag/resize frame
 *  (compaction can shift items other than the one being moved). Only the
 *  entries that actually differ from current widget state are returned, so
 *  callers avoid redundant updateWidget calls/re-renders for untouched items. */
export function diffLayoutChanges(widgets: Widget[], next: Layout): WidgetPositionChange[] {
  const changes: WidgetPositionChange[] = [];
  for (const item of next) {
    const widget = widgets.find(w => w.id === item.i);
    if (!widget) continue;
    const col = item.x + 1;
    const row = item.y + 1;
    if (widget.col !== col || widget.row !== row || widget.w !== item.w || widget.h !== item.h) {
      changes.push({ id: widget.id, col, row, w: item.w, h: item.h });
    }
  }
  return changes;
}
