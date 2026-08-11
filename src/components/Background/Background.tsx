import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useBackground } from '../../contexts/BackgroundContext';
import type { BackgroundPosition } from '../../types/background';
import './Background.css';

// Extracts the quoted url("...") from a CSS `background` shorthand value, if present.
function extractUrl(css: string): string | null {
  const match = css.match(/url\(["']?([^"')]+)["']?\)/);
  return match ? match[1] : null;
}

// Splits a provider's resolved `background` shorthand string (a flat hex, a
// gradient function, or a `url(...) center/cover no-repeat` value) into
// explicit longhand properties. React warns when a style object mixes the
// `background` shorthand with longhands like backgroundSize/backgroundPosition
// in the same object (the shorthand implicitly resets those sub-properties),
// so the modular display controls (blur/scaleToFit/position) below need the
// layer's own image/color expressed as longhands too, never the shorthand.
function splitBackgroundLayer(css: string): Pick<CSSProperties, 'backgroundImage' | 'backgroundColor'> {
  const url = extractUrl(css);
  if (url) return { backgroundImage: `url("${url}")` };
  if (/^#[0-9a-fA-F]{3,8}$/.test(css.trim())) return { backgroundColor: css.trim() };
  // linear-gradient(...) or any other CSS <image> function — valid directly
  // as background-image, unlike a flat color.
  return { backgroundImage: css };
}

// Parses "HH:MM" into minutes since midnight. Malformed input (missing colon,
// non-numeric parts) falls back to 0 rather than throwing.
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// Whether the current system time falls within [start, end). Handles windows
// that cross midnight (start > end, e.g. 22:00 → 05:00) as well as same-day
// windows (start < end, e.g. 09:00 → 17:00).
export function isNightTime(start: string, end: string, now: Date = new Date()): boolean {
  const startMin = parseTimeToMinutes(start);
  const endMin   = parseTimeToMinutes(end);
  const nowMin   = now.getHours() * 60 + now.getMinutes();

  if (startMin === endMin) return false;
  if (startMin < endMin) {
    // Same-day window, e.g. 09:00 → 17:00
    return nowMin >= startMin && nowMin < endMin;
  }
  // Crosses midnight, e.g. 22:00 → 05:00
  return nowMin >= startMin || nowMin < endMin;
}

// Re-evaluates isNightTime() once a minute so the dim state flips on its own
// without a page refresh, without needing a full second-by-second clock tick.
function useIsNightTime(start: string, end: string): boolean {
  const [isNight, setIsNight] = useState(() => isNightTime(start, end));

  useEffect(() => {
    setIsNight(isNightTime(start, end));
    const id = setInterval(() => setIsNight(isNightTime(start, end)), 60_000);
    return () => clearInterval(id);
  }, [start, end]);

  return isNight;
}

// Dual-layer cross-fade (a double buffer): two absolutely-stacked
// layers hold the current and incoming background CSS; swapping which one is
// "active" (opacity 1) drives the fade via the shared .sg-bg-layer transition.
// Image-backed values are preloaded through a detached Image() before the
// swap so the fade never reveals a half-loaded/blank frame; solid colors and
// gradients need no preload and swap immediately.
function useCrossfadeBackground(backgroundCss: string) {
  const [layers, setLayers] = useState<[string, string]>([backgroundCss, backgroundCss]);
  const [active, setActive] = useState<0 | 1>(0);
  const lastCss = useRef(backgroundCss);

  useEffect(() => {
    if (backgroundCss === lastCss.current) return;
    lastCss.current = backgroundCss;
    const nextIndex: 0 | 1 = active === 0 ? 1 : 0;

    const swap = () => {
      setLayers(prev => {
        const copy = [...prev] as [string, string];
        copy[nextIndex] = backgroundCss;
        return copy;
      });
      setActive(nextIndex);
    };

    const url = extractUrl(backgroundCss);
    if (!url) { swap(); return; }

    let cancelled = false;
    const img = new Image();
    img.onload  = () => { if (!cancelled) swap(); };
    img.onerror = () => { if (!cancelled) swap(); }; // fall back to an instant swap rather than getting stuck
    img.src = url;
    return () => { cancelled = true; };
  }, [backgroundCss, active]);

  return { layers, active };
}

// "Scale to fit" (object-fit: contain) defaults to off for the live daily-photo
// providers — their images are typically already close to viewport aspect ratio,
// and "fill" (cover) avoids letterboxing more often than not for these sources.
// Custom/online image uploads keep the old true default, since those are
// user-supplied images of unknown aspect ratio where avoiding a crop matters more.
const SCALE_TO_FIT_DEFAULT_FALSE_MODES = new Set(['bing', 'astronomy', 'unsplash', 'wikimedia']);

const POSITION_CSS: Record<BackgroundPosition, string> = {
  center:       'center',
  top:          'top',
  bottom:       'bottom',
  left:         'left',
  right:        'right',
  'top-left':     'left top',
  'top-right':    'right top',
  'bottom-left':  'left bottom',
  'bottom-right': 'right bottom',
};

export default function Background() {
  const { backgroundCss, config, unsplash, bing, astronomy, wikimedia } = useBackground();
  const { layers, active } = useCrossfadeBackground(backgroundCss);

  // Modular display controls — apply to the active layer regardless of provider.
  const blur         = config.blur ?? 0;
  const luminosity   = config.luminosity ?? 100;
  const scaleToFit   = config.scaleToFit ?? !SCALE_TO_FIT_DEFAULT_FALSE_MODES.has(config.mode);

  // Every image-backed provider shares the same letterbox fill color for the
  // empty space around a "contain"-fitted image — solid/gradient modes never
  // render a letterbox div at all.
  const isImageMode = config.mode === 'custom' || config.mode === 'online' || config.mode === 'bing'
    || config.mode === 'astronomy' || config.mode === 'wikimedia' || config.mode === 'unsplash';
  const isFit       = isImageMode && scaleToFit;
  const letterboxBg = config.letterboxColor ?? '#000000';
  const position     = config.position ?? 'center';
  const autoDimNight = config.autoDimNight ?? false;
  const nightStart   = config.nightStart ?? '22:00';
  const nightEnd     = config.nightEnd ?? '05:00';

  const isNight = useIsNightTime(nightStart, nightEnd);
  // Additional multiplicative dim during the configured night window — the
  // stored luminosity value itself is never mutated, only the rendered brightness.
  const effectiveLuminosity = autoDimNight && isNight ? luminosity * 0.6 : luminosity;

  const layerStyle: CSSProperties = {
    filter: `blur(${blur}px) brightness(${effectiveLuminosity / 100})`,
    backgroundSize: scaleToFit ? 'contain' : 'cover',
    backgroundPosition: POSITION_CSS[position],
    backgroundRepeat: 'no-repeat',
  };

  const layer0Style = splitBackgroundLayer(layers[0]);
  const layer1Style = splitBackgroundLayer(layers[1]);

  const showAttribution =
    config.mode === 'unsplash' &&
    (config.showAttribution ?? true) &&
    !!unsplash.attribution;

  const showApodTitle =
    config.mode === 'astronomy' &&
    (config.showApodTitle ?? false) &&
    !!astronomy.title;

  const showBingTitle =
    config.mode === 'bing' &&
    (config.showTitle ?? false) &&
    !!bing.title;

  const showWikimediaTitle =
    config.mode === 'wikimedia' &&
    (config.showTitle ?? false) &&
    !!wikimedia.title;

  return (
    <>
      {isFit && (
        <div className="sg-background-letterbox" style={{ background: letterboxBg }} />
      )}
      <div className={`sg-bg-layer${active === 0 ? ' sg-bg-layer--active' : ''}`} style={{ ...layer0Style, ...layerStyle }} />
      <div className={`sg-bg-layer${active === 1 ? ' sg-bg-layer--active' : ''}`} style={{ ...layer1Style, ...layerStyle }} />
      {showAttribution && unsplash.attribution && (
        <div className="sg-bg-attribution sg-apod-title-active">
          Photo by{' '}
          <a
            href={unsplash.attribution.photographerUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {unsplash.attribution.photographerName}
          </a>
          {' '}on{' '}
          <a
            href={`https://unsplash.com?utm_source=startgrid&utm_medium=referral`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Unsplash
          </a>
        </div>
      )}
      {showApodTitle && (
        <div className="sg-bg-attribution sg-apod-title-active">
          {astronomy.title}
          {astronomy.copyright && <>{' '}&copy; {astronomy.copyright}</>}
        </div>
      )}
      {showBingTitle && (
        <div className="sg-bg-attribution sg-apod-title-active">
          {bing.title}
        </div>
      )}
      {showWikimediaTitle && (
        <div className="sg-bg-attribution sg-apod-title-active">
          {wikimedia.title}
          {wikimedia.artist && <>{' '}&copy; {wikimedia.artist}</>}
        </div>
      )}
    </>
  );
}
