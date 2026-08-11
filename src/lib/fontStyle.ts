import type { CSSProperties } from 'react';
import type { FontSettings } from '../types/widget';

/**
 * Resolves a widget's FontSettings into an inline style object. `useAccentColor`
 * maps to the live CSS custom property (var(--accent)) rather than a resolved
 * hex — it always tracks the current accent color, light/dark theme included.
 */
export function resolveFontStyle(fs: FontSettings | undefined): CSSProperties {
  if (!fs) return {};
  const style: Record<string, string | number> = {};

  if (fs.fontFamily)   style.fontFamily = fs.fontFamily;
  if (fs.fontWeight)   style.fontWeight = fs.fontWeight;
  if (fs.italic)       style.fontStyle = 'italic';
  if (fs.underline)    style.textDecoration = 'underline';

  if (fs.useAccentColor) style.color = 'var(--accent)';
  else if (fs.color)     style.color = fs.color;

  if (fs.textOutline) {
    const outlineColor = fs.textOutlineColor ?? '#000000';
    if (fs.textOutlineStyle === 'advanced') {
      const size = fs.textOutlineSize ?? 1;
      style.WebkitTextStroke = `${size}px ${outlineColor}`;
    } else {
      // Basic mode: a fixed-size 4-direction text-shadow — a "can only have
      // one size" basic outline, size input ignored.
      style.textShadow = [
        `-1px -1px 0 ${outlineColor}`,
        `1px -1px 0 ${outlineColor}`,
        `-1px 1px 0 ${outlineColor}`,
        `1px 1px 0 ${outlineColor}`,
      ].join(', ');
    }
  }

  return style as CSSProperties;
}
