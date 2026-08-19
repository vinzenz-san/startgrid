import type { Widget, WidgetType } from '../types/widget';
import { WIDGET_REGISTRY } from '../components/widgets/registry';
import { assertWidgetData } from './widgetGuards';

function intersects(
  aCol: number, aRow: number, aW: number, aH: number,
  bCol: number, bRow: number, bW: number, bH: number,
): boolean {
  return aCol < bCol + bW && aCol + aW > bCol &&
         aRow < bRow + bH && aRow + aH > bRow;
}

/** Returns true when the rectangle (col, row, w, h) does not overlap any widget except the one with the given id. */
export function isPositionFree(
  widgets: Widget[],
  id: string,
  col: number, row: number, w: number, h: number,
): boolean {
  return !widgets.some(wgt =>
    wgt.id !== id && intersects(col, row, w, h, wgt.col, wgt.row, wgt.w, wgt.h)
  );
}

/** Scans from the top-left for the first free (col, row) fitting a w×h
 *  rectangle within `columns` columns. Used for "add a new widget", where
 *  there's no existing position to stay near. */
export function findFreePosition(widgets: Widget[], columns: number, w: number, h: number): { col: number; row: number } {
  for (let row = 1; row <= 50; row++) {
    for (let col = 1; col <= columns - w + 1; col++) {
      if (!widgets.some(wgt => intersects(col, row, w, h, wgt.col, wgt.row, wgt.w, wgt.h)))
        return { col, row };
    }
  }
  return { col: 1, row: 1 };
}

/** Builds a placeable widget of the given type at the first free position —
 *  the "add a widget from the menu" logic, used by CommandPalette.tsx (the
 *  sole add-widget UI) so any future trigger adds widgets identically instead
 *  of duplicating the same findFreePosition + registry-defaults assembly.
 *  Caller still owns actually calling addWidget() with the result. */
export function buildNewWidget(widgets: Widget[], columns: number, type: WidgetType): Omit<Widget, 'id'> {
  const { defaultSize, defaultData, defaultStyle } = WIDGET_REGISTRY[type];
  const { col, row } = findFreePosition(widgets, columns, defaultSize.w, defaultSize.h);
  // See assertWidgetData's own doc for why this cast is needed and how it's checked.
  return assertWidgetData({ type, col, row, w: defaultSize.w, h: defaultSize.h, data: defaultData, ...defaultStyle });
}

/** Like findFreePosition, but searches outward from a preferred (col, row)
 *  instead of always starting at the top-left — used by the grid-rescale
 *  transform (gridRescale.ts) so a widget that collides after rounding gets
 *  nudged the minimum necessary distance from its own rescaled position,
 *  rather than being relocated to wherever the first free slot happens to be
 *  from the origin. Expands ring-by-ring (Chebyshev distance) from the
 *  preferred cell, clamping candidate columns to stay within [1, columns-w+1]
 *  and rows to stay >= 1, until a free rectangle is found. */
export function findNearestFreePosition(
  widgets: Widget[],
  columns: number,
  id: string,
  w: number, h: number,
  preferredCol: number, preferredRow: number,
): { col: number; row: number } {
  const maxCol = Math.max(1, columns - w + 1);
  const startCol = Math.min(Math.max(1, preferredCol), maxCol);
  const startRow = Math.max(1, preferredRow);

  if (isPositionFree(widgets, id, startCol, startRow, w, h)) {
    return { col: startCol, row: startRow };
  }

  // Expanding ring search: at each radius, check every cell on the ring's
  // perimeter (not the full filled square) so larger radii don't re-check
  // cells already ruled out at smaller radii.
  const MAX_RADIUS = 200; // generous ceiling — a real layout collides far less than this
  for (let radius = 1; radius <= MAX_RADIUS; radius++) {
    for (let dRow = -radius; dRow <= radius; dRow++) {
      const onRowEdge = Math.abs(dRow) === radius;
      const rowStep = onRowEdge ? 1 : radius * 2; // interior rows only need the two column edges
      for (let dCol = -radius; dCol <= radius; dCol += (onRowEdge ? 1 : rowStep || 1)) {
        if (!onRowEdge && dCol !== -radius && dCol !== radius) continue;
        const col = startCol + dCol;
        const row = startRow + dRow;
        if (col < 1 || col > maxCol || row < 1) continue;
        if (isPositionFree(widgets, id, col, row, w, h)) return { col, row };
      }
    }
  }

  // Exhausted the search radius (pathological/very dense layout) — fall back
  // to the origin-scan so we always return *something* placeable.
  return findFreePosition(widgets, columns, w, h);
}

/** Topmost, then leftmost, free (col, row) a w×h rectangle fits into,
 *  searching only rows 1..maxRow (a widget being compacted should only ever
 *  move up, never down past its own current row) — used by compactWidgets
 *  below. Returns null if nothing in that range fits (shouldn't happen in
 *  practice, since the widget's own current position is always within the
 *  scanned range and is a valid fallback). */
function findTopLeftFit(
  widgets: Widget[],
  id: string,
  w: number, h: number,
  maxRow: number, columns: number,
): { col: number; row: number } | null {
  for (let row = 1; row <= maxRow; row++) {
    for (let col = 1; col <= columns - w + 1; col++) {
      if (isPositionFree(widgets, id, col, row, w, h)) return { col, row };
    }
  }
  return null;
}

/** "Compact Grid" / gravity pass: pulls every widget as far up-and-left as
 *  it can go without overlapping anything, closing empty gaps left behind
 *  by moved/removed widgets. Processes widgets in row-then-column order so
 *  earlier (topmost/leftmost) widgets settle into their final spot first,
 *  and later widgets compact around them — deterministic regardless of the
 *  input array's own order. Pure function: takes the current layout, returns
 *  a new one; callers persist the result themselves. */
export function compactWidgets(widgets: Widget[], columns: number): Widget[] {
  const sorted = [...widgets].sort((a, b) => a.row - b.row || a.col - b.col);
  const placed: Widget[] = [];
  for (const widget of sorted) {
    const fit = findTopLeftFit(placed, widget.id, widget.w, widget.h, widget.row, columns)
      ?? { row: widget.row, col: widget.col };
    placed.push({ ...widget, row: fit.row, col: fit.col });
  }
  return placed;
}
