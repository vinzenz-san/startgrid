import type { CSSProperties } from 'react';
import type { DisplaySettings } from '../types/widget';

// The old discrete Date-size tiers averaged out to roughly 36% of the
// matching Time-size tier (15/42 at the "M" default) — used here as a fixed
// ratio so the date line keeps scaling relative to the single Font Size
// slider instead of needing its own separate control.
const DATE_SIZE_RATIO = 0.36;

export interface ResolvedDisplayStyle {
  /** transform: scale + rotate — apply to the widget's outer wrapper. */
  wrapper:  CSSProperties;
  /** The resolved primary font size — a CSS calc() expression multiplying
   *  the widget's own fixed default by the global Font Scale setting
   *  (--sg-font-scale, set per-widget in WidgetContainer.tsx). */
  fontSize: string;
  /** Secondary-text font size, derived from `fontSize` via DATE_SIZE_RATIO,
   *  same global-scale calc() shape. Named for its original use (Clock's
   *  date line) — any widget with a secondary text element can reuse it. */
  dateFontSize: string;
}

/** Any widget with several text elements that should scale together off one
 *  base size (e.g. Weather's icon/temp/condition/secondary ratios) can reuse
 *  this directly instead of going through resolveDisplayStyle's own single
 *  fontSize/dateFontSize pair. */
export const scaledFontSize = (px: number) => `calc(${px}px * var(--sg-font-scale, 1))`;

/** @param defaultFontSize the widget's own fixed base font size (e.g. Greeting's 28px, Weather's temp size) — resolveDisplayStyle has no opinion of its own, since that default is a per-widget design choice.
 *  @param defaultPadding matches the widget's own CSS padding (currently 12px for every widget using this panel) — kept as a param rather than hardcoded so a future widget with a different base padding isn't forced to 12. */
export function resolveDisplayStyle(ds: DisplaySettings | undefined, defaultFontSize = 42, defaultPadding = 12): ResolvedDisplayStyle {
  const scale    = ds?.scale    ?? 1;
  const rotation = ds?.rotation ?? 0;
  const padding  = ds?.padding  ?? defaultPadding;

  const wrapper: CSSProperties = {
    padding: `${padding}px`,
    ...(scale !== 1 || rotation !== 0
      ? { transform: `scale(${scale}) rotate(${rotation}deg)` }
      : {}),
  };

  return {
    wrapper,
    fontSize: scaledFontSize(defaultFontSize),
    dateFontSize: scaledFontSize(Math.round(defaultFontSize * DATE_SIZE_RATIO)),
  };
}
