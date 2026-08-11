import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useContainerWidth } from 'react-grid-layout';
import GridLayout, { type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useEditMode } from '../../contexts/EditModeContext';
import { useWidgets } from '../../contexts/WidgetContext';
import { useGridConfig } from '../../contexts/GridConfigContext';
import { widgetsToLayout, diffLayoutChanges, dragCompactor, fullPageDragCompactor } from '../../lib/rglAdapter';
import WidgetContainer from '../shared/WidgetContainer';

interface Props {
  contentRows: number;
  disableGridGlow: boolean;
}

export default function RGLGrid({ contentRows, disableGridGlow }: Props) {
  const { isEditMode } = useEditMode();
  const { widgets, updateWidget, loaded } = useWidgets();
  const { gridConfig } = useGridConfig();
  const { columns, cellWidth, cellHeight, gap, fullPageGrid } = gridConfig;

  // RGL's own item-to-item spacing (gridConfig.margin below) replaces the old
  // outer-edge inset that used to be split between .sg-grid's CSS padding and
  // each widget's own margin (see WidgetContainer.css). The outer gap-inset
  // is now this element's plain CSS `padding: var(--gap)` (Grid.css), so the
  // inner box RGL measures excludes it — sized so RGL's own column-width
  // formula ((containerWidth - margin*(cols-1)) / cols) resolves to exactly
  // cellWidth, keeping the configured cell size pixel-for-pixel unchanged.
  const fixedWidth = columns * cellWidth + gap * (columns - 1);

  // Full Page Grid mode: instead of sizing the grid box to columns*cellWidth
  // (fixedWidth above), stretch it to whatever width the wrapper actually has
  // — RGL derives each column's pixel width from `width`/`cols` itself, so
  // handing it the live container width is enough to make columns fill the
  // full page edge-to-edge without a separate colWidth config.
  //
  // containerRef is attached to a plain width:100% measuring div (below),
  // NOT to .sg-grid itself — .sg-grid's own children (GridLayout's items)
  // are all position:absolute, so with width left at `auto` in full-page
  // mode .sg-grid has no intrinsic content width to measure and collapses
  // toward 0, which is self-referential (measuring the box whose width we're
  // trying to compute) and was producing the near-0-width column squeeze.
  // The measuring div instead just stretches to fill .sg-grid-wrapper's flex
  // space regardless of what .sg-grid itself renders.
  const { width: measuredWidth, containerRef } = useContainerWidth({ initialWidth: fixedWidth });
  const innerWidth = fullPageGrid ? measuredWidth : fixedWidth;

  // .sg-grid's decorative dot-grid background and glow-line overlay (Grid.css)
  // are plain CSS, driven by the --cell-w custom property GridConfigContext
  // sets globally from the *configured* cellWidth — they have no way to know
  // the real per-column pixel width RGL derives internally from width/cols
  // once Full Page Grid stretches columns wider than that. Overriding --cell-w
  // locally on this element with the actual full-page column width keeps
  // those decorative layers' line spacing in sync with where columns really
  // are, instead of the static configured size.
  const fullPageCellWidth = (innerWidth - gap * (columns - 1)) / columns;

  // Suppress the built-in position/size CSS transition for the very first
  // paint only (storage → layout has no "previous" position to animate
  // from) — re-enabled 100ms after mount so real drag/resize moves still
  // animate. Brief on purpose: this only ever gated the CSS transition
  // class, never widget content itself, but kept short regardless so it
  // can't be mistaken for (or contribute to) any content-render delay.
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const layout: Layout = widgetsToLayout(widgets);

  const handleLayoutChange = (next: Layout) => {
    for (const change of diffLayoutChanges(widgets, next)) {
      updateWidget(change.id, { col: change.col, row: change.row, w: change.w, h: change.h });
    }
  };

  // Full-layout snapshot taken the instant a drag starts — lets a drag that
  // ends back at its own starting cell undo every widget it pushed along the
  // way, not just itself. The live vertical compactor (dragCompactor, see
  // rglAdapter.ts) already pulls most displaced widgets most of the way back
  // as the dragged item moves past them (the "rubber-band" feel), but that's
  // a best-effort visual settle, not a guarantee it lands every widget back
  // on its exact original cell — this snapshot is the hard guarantee for the
  // "cancelled drag" case specifically.
  const dragSnapshotRef = useRef<Layout | null>(null);

  const handleDragStart = (startLayout: Layout) => {
    dragSnapshotRef.current = startLayout.map(item => ({ ...item }));
  };

  const handleDragStop = (finalLayout: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
    const snapshot = dragSnapshotRef.current;
    dragSnapshotRef.current = null;
    if (!snapshot || !oldItem || !newItem) return;

    const returnedToOrigin = newItem.x === oldItem.x && newItem.y === oldItem.y;
    if (returnedToOrigin) {
      // Force every widget back to its pre-drag cell, overriding whatever
      // partial displacement the live onLayoutChange stream committed —
      // this is the actual fix for the drift bug, not just cosmetic.
      for (const item of snapshot) {
        const widget = widgets.find(w => w.id === item.i);
        const col = item.x + 1, row = item.y + 1;
        if (widget && (widget.col !== col || widget.row !== row || widget.w !== item.w || widget.h !== item.h)) {
          updateWidget(item.i, { col, row, w: item.w, h: item.h });
        }
      }
    } else {
      // Landed somewhere new — reconcile once more against the authoritative
      // final layout, in case any intermediate onLayoutChange call during
      // the drag got coalesced/missed.
      for (const change of diffLayoutChanges(widgets, finalLayout)) {
        updateWidget(change.id, { col: change.col, row: change.row, w: change.w, h: change.h });
      }
    }
  };

  return (
    <div ref={containerRef} className="sg-grid-measure">
      <div
        className={`sg-grid${animated ? ' sg-grid--animated' : ''}${fullPageGrid ? ' sg-grid--full-page' : ''}`}
        style={{
          '--content-rows': contentRows,
          ...(fullPageGrid ? { '--cell-w': `${fullPageCellWidth}px` } : {}),
        } as CSSProperties}
      >
        {!disableGridGlow && (
          <div className="sg-grid-glow-clip">
            <div className="sg-grid-glow-overlay" />
          </div>
        )}
        {loaded && (
          <GridLayout
            layout={layout}
            width={innerWidth}
            gridConfig={{ cols: columns, rowHeight: cellHeight, margin: [gap, gap], containerPadding: [0, 0] }}
            dragConfig={{ enabled: isEditMode }}
            resizeConfig={{ enabled: isEditMode, handles: ['se'] }}
            compactor={fullPageGrid ? fullPageDragCompactor : dragCompactor}
            autoSize={false}
            onLayoutChange={handleLayoutChange}
            onDragStart={handleDragStart}
            onDragStop={handleDragStop}
          >
            {widgets.map(widget => (
              <div key={widget.id} className="sg-widget-item">
                <WidgetContainer widget={widget} />
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}
