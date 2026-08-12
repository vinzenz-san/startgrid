import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface Props {
  children: string;
  minFontSize?: number;
  maxFontSize?: number;
  /** Fraction of the container's width the text is allowed to naturally
   *  reach before the remaining slack is left as safety margin against
   *  wrapping/clipping — lower is more conservative (more empty space
   *  around the text), higher fills the box more tightly. Default 0.7. */
  widthFactor?: number;
  /** Passed to both the real text and the hidden probe used to measure its
   *  aspect ratio — a heavier weight renders visibly wider, so the probe
   *  needs to match or the computed size skews too generous for how the
   *  text actually renders. */
  fontWeight?: number;
  className?: string;
  style?: CSSProperties;
}

// Detached, invisible span used purely to measure how a string's rendered
// height relates to its rendered width at the browser's default font size —
// that ratio stays effectively constant across font sizes for a given string
// (both dimensions scale together), so measuring once at an arbitrary size
// is enough to reason about any target size. fontWeight must match the real
// text's — see the Props doc comment above.
function measureTextAspectRatio(text: string, fontWeight?: number): number {
  const span = document.createElement('span');
  span.style.position = 'absolute';
  span.style.visibility = 'hidden';
  span.style.whiteSpace = 'nowrap';
  if (fontWeight) span.style.fontWeight = String(fontWeight);
  span.textContent = text;
  document.body.appendChild(span);
  const rect = span.getBoundingClientRect();
  document.body.removeChild(span);
  return rect.width > 0 ? rect.height / rect.width : 1;
}

/**
 * Auto-scales its text content to fill the available box, recomputing on
 * every resize of its own container (widget resize in edit mode) and every
 * change to the displayed string (e.g. a clock's digits). No user-facing
 * size control — the box IS the control, same spirit as "less is more":
 * there's nothing to configure because the result can't drift out of sync
 * with the widget's actual size the way a manually-set font size can.
 */
export default function FitText({ children, minFontSize = 20, maxFontSize = 200, widthFactor = 0.7, fontWeight, className, style }: Props): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const recompute = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const ratio = measureTextAspectRatio(children, fontWeight);
      const widthDriven = width * widthFactor * ratio;
      const size = Math.min(height, widthDriven);
      setFontSize(Math.min(maxFontSize, Math.max(minFontSize, size)));
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, minFontSize, maxFontSize, widthFactor, fontWeight]);

  return (
    <div ref={ref} className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <span style={fontSize !== null ? { fontSize: `${fontSize}px`, lineHeight: 1, fontWeight } : { visibility: 'hidden' }}>
        {children}
      </span>
    </div>
  );
}
