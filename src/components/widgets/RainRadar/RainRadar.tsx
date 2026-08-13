import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RainRadarData } from '../../../types/widget';
import { SettingsRow, SettingsSlider, Dropdown, ActionButton, IconButton } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { geocodeCity, type GeocodeResult } from '../../../lib/openMeteoApi';
import { fetchRadarTimeline, radarTileUrlTemplate, type RadarTimeline } from '../../../lib/rainviewerApi';
import './RainRadar.css';

const DEFAULT_ZOOM = 9; // city-level, not the country-wide view zoom 6 gave
const MAP_ZOOM_MIN = 3;
const MAP_ZOOM_MAX = 12;
// RainViewer's radar tiles only exist up to native zoom 7 (per their API
// docs) — past that, maxNativeZoom below upscales the level-7 tiles instead
// of requesting nonexistent ones. The base map itself can still zoom in
// further (CARTO tiles go up to 19), just with a blurrier radar overlay.
const RADAR_NATIVE_MAX_ZOOM = 7;
const DEFAULT_OPACITY = 70;
const PLAY_INTERVAL_MS = 700;
// Leaflet's 'load' event isn't guaranteed to fire for every setUrl() (can be
// missed on instant/cached loads), which left some swaps never happening —
// this bounds how long we wait before swapping anyway.
const SWAP_FALLBACK_MS = 500;
const SEARCH_DEBOUNCE_MS = 450;

// CARTO's Voyager style is deliberately low-saturation, meant as a neutral
// general-purpose basemap — reads as washed-out/white next to something like
// WetterOnline's punchier terrain greens. Rather than adopting a different
// tile provider (more usage-policy risk to vet, as tile.openstreetmap.org
// itself already burned us once), boost it with a CSS filter on the tile
// layer's own container instead.
const VOYAGER_FILTER = 'saturate(2.4) brightness(0.85) contrast(1.2)';

// Deliberately no CSS opacity transition here: the two layers hold different
// radar frames, so a gradual cross-fade between them shows both at reduced
// opacity mid-transition, which reads as the rain washing out instead of
// moving. An instant swap between two fully-loaded frames reads as motion.

// ── Settings ───────────────────────────────────────────────────────────────

interface SettingsProps {
  data: RainRadarData;
  onUpdateData: (patch: Partial<RainRadarData>) => void;
}

export function RainRadarSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const opacity = data.opacity ?? DEFAULT_OPACITY;
  const zoom = data.zoom ?? DEFAULT_ZOOM;
  const mapStyle = data.mapStyle ?? 'auto';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        setResults(await geocodeCity(q));
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const selectResult = (r: GeocodeResult) => {
    onUpdateData({
      locationName: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      latitude: r.latitude,
      longitude: r.longitude,
    });
    setQuery('');
    setResults([]);
  };

  return (
    <div className="sg-rainradar-settings" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.weather.searchCity')}>
        <input
          className="sg-weather-input"
          placeholder={t('widget.weather.searchPlaceholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        />
      </SettingsRow>

      {searching && <div className="sg-weather-search-hint">{t('widget.weather.locating')}</div>}
      {searchError && <div className="sg-weather-search-error">{searchError}</div>}

      {results.length > 0 && (
        <div className="sg-weather-results">
          {results.map((r, i) => (
            <button
              key={`${r.latitude}-${r.longitude}-${i}`}
              className="sg-weather-result"
              onClick={() => selectResult(r)}
            >
              {[r.name, r.admin1, r.country].filter(Boolean).join(', ')}
            </button>
          ))}
        </div>
      )}

      {data.locationName && (
        <div className="sg-weather-current-location">{data.locationName}</div>
      )}

      <SettingsSlider
        label={t('widget.rainRadar.zoom')}
        value={zoom}
        onChange={v => onUpdateData({ zoom: v })}
        min={MAP_ZOOM_MIN}
        max={MAP_ZOOM_MAX}
        step={1}
        valueFormatter={v => String(v)}
        defaultValue={DEFAULT_ZOOM}
      />

      <SettingsSlider
        label={t('widget.rainRadar.opacity')}
        value={opacity}
        onChange={v => onUpdateData({ opacity: v })}
        defaultValue={DEFAULT_OPACITY}
      />

      <SettingsRow label={t('widget.rainRadar.mapStyle')}>
        <Dropdown
          options={[
            { value: 'auto',    label: t('widget.rainRadar.mapStyle.auto') },
            { value: 'voyager', label: t('widget.rainRadar.mapStyle.voyager') },
          ]}
          value={mapStyle}
          onChange={v => onUpdateData({ mapStyle: v as RainRadarData['mapStyle'] })}
        />
      </SettingsRow>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

interface Props {
  data: RainRadarData;
}

export default function RainRadar({ data }: Props) {
  const { t, colorScheme } = useSettings();
  const isDark = colorScheme === 'dark'
    || (colorScheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const zoom = data.zoom ?? DEFAULT_ZOOM;
  const opacity = data.opacity ?? DEFAULT_OPACITY;
  const mapStyle = data.mapStyle ?? 'auto';

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  // A circleMarker (not L.circle) — its radius is a fixed pixel size, not a
  // real-world distance, so it stays the same visual size at any zoom level
  // instead of shrinking away when zoomed out.
  const locationMarkerRef = useRef<L.CircleMarker | null>(null);
  // Double-buffered radar overlay: two layers, only one visible at a time.
  // The next frame is preloaded into the hidden one and only swapped in once
  // fully loaded, so there's never a blank gap between frames (see the
  // effect below for why a single reused layer still flickered).
  const radarLayersRef = useRef<[L.TileLayer | null, L.TileLayer | null]>([null, null]);
  const activeLayerRef = useRef(0);
  const loadTokenRef = useRef(0);

  const [timeline, setTimeline] = useState<RadarTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const hasLocation = data.latitude !== undefined && data.longitude !== undefined;

  const [retryTick, setRetryTick] = useState(0);

  // Fetch the current radar frame timeline on mount and on retry.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchRadarTimeline()
      .then(tl => { if (!cancelled) { setTimeline(tl); setFrameIndex(tl.frames.length - 1); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Radar unavailable'); });
    return () => { cancelled = true; };
  }, [retryTick]);

  // Create the map once — initial zoom only; the next effect keeps zoom in
  // sync with settings changes without recreating the map.
  //
  // Base tiles come from CARTO's free basemaps, not tile.openstreetmap.org:
  // OSM's own tile servers are volunteer-run and their Tile Usage Policy
  // (osm.wiki/Tile_usage_policy) explicitly disallows bulk/embedded use from
  // distributed apps like a browser extension — that's what the 403 "Referer
  // is required" block (osm.wiki/Blocked) was actually about, not a missing
  // header. CARTO's basemaps are built on the same OSM data, explicitly
  // permit this kind of use, and need no API key — just the attribution
  // below, which the tile license requires (attributionControl must stay on).
  useEffect(() => {
    if (!mapRef.current || !hasLocation || leafletMapRef.current) return;
    const map = L.map(mapRef.current, {
      center: [data.latitude!, data.longitude!],
      zoom,
      zoomControl: false,
      attributionControl: true,
      // Leaflet fades in newly-loaded tiles by default (CSS opacity
      // transition on each tile). That's fine for a base map you're panning
      // around, but for the radar overlay it's exactly the "fading in"
      // effect making frame swaps look flashy — turn it off map-wide.
      fadeAnimation: false,
    });
    const style = mapStyle === 'voyager' ? 'rastertiles/voyager' : (isDark ? 'dark_all' : 'light_all');
    baseLayerRef.current = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`, {
      maxZoom: 19,
      subdomains: 'abcd',
      // Keep more off-screen tiles cached (default 2) so fast panning is
      // less likely to hit a genuinely un-fetched tile.
      keepBuffer: 6,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    if (mapStyle === 'voyager') {
      const el = baseLayerRef.current.getContainer();
      if (el) el.style.filter = VOYAGER_FILTER;
    }

    locationMarkerRef.current = L.circleMarker([data.latitude!, data.longitude!], {
      radius: 6,
      color: '#fff',
      weight: 2,
      fillColor: '#e53935',
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);

    leafletMapRef.current = map;

    // Leaflet caches the container's pixel size at creation time and has no
    // way to know it changes later — resizing the widget (grid drag-resize)
    // left the map's internal size stale, so newly-revealed area stayed
    // blank and recenter/flyTo targeted the wrong pixel offset. A
    // ResizeObserver on the container tells it to recompute.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(mapRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      leafletMapRef.current = null;
      baseLayerRef.current = null;
      locationMarkerRef.current = null;
      radarLayersRef.current = [null, null];
      activeLayerRef.current = 0;
    };
    // isDark deliberately excluded: recreating the whole map on theme change
    // would also reset the radar overlay refs with nothing to rebuild them
    // (the frame effect only reacts to timeline/frameIndex), making the
    // loaded rain image disappear on every light/dark toggle. The dedicated
    // effect below swaps just the base layer's URL instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, data.latitude, data.longitude]);

  // Theme or map-style change: swap only the base map's tile URL, leaving
  // the map instance and radar overlay untouched (same reasoning as the
  // isDark exclusion above — recreating the map would drop them).
  useEffect(() => {
    const style = mapStyle === 'voyager' ? 'rastertiles/voyager' : (isDark ? 'dark_all' : 'light_all');
    baseLayerRef.current?.setUrl(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`);
    const el = baseLayerRef.current?.getContainer();
    if (el) el.style.filter = mapStyle === 'voyager' ? VOYAGER_FILTER : '';
  }, [isDark, mapStyle]);

  // Keep center/zoom in sync with settings changes.
  useEffect(() => {
    if (!leafletMapRef.current || !hasLocation) return;
    leafletMapRef.current.setView([data.latitude!, data.longitude!], zoom);
  }, [data.latitude, data.longitude, zoom, hasLocation]);

  // Radar overlay: double-buffered. Leaflet's setUrl()/redraw() removes and
  // rebuilds every tile in a layer, so even a single reused layer left a
  // blank gap while the new frame's tiles loaded — that was the flashing.
  // Instead: preload the next frame into the hidden layer at opacity 0, and
  // only reveal it (while hiding the previously-visible one) once its tiles
  // have actually finished loading.
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !timeline || timeline.frames.length === 0) return;
    const frame = timeline.frames[frameIndex];
    if (!frame) return;
    const url = radarTileUrlTemplate(timeline.host, frame);
    const targetOpacity = opacity / 100;

    const [a, b] = radarLayersRef.current;
    if (!a || !b) {
      // First frame ever shown: create both layers, only "a" visible.
      const layerA = L.tileLayer(url, { opacity: targetOpacity, zIndex: 10, maxNativeZoom: RADAR_NATIVE_MAX_ZOOM, maxZoom: 19 }).addTo(map);
      const layerB = L.tileLayer(url, { opacity: 0, zIndex: 9, maxNativeZoom: RADAR_NATIVE_MAX_ZOOM, maxZoom: 19 }).addTo(map);
      radarLayersRef.current = [layerA, layerB];
      activeLayerRef.current = 0;
      return;
    }

    const activeIdx = activeLayerRef.current;
    const hidden = activeIdx === 0 ? b : a;
    const visible = activeIdx === 0 ? a : b;

    const token = ++loadTokenRef.current;
    let swapped = false;
    const swap = () => {
      if (swapped || loadTokenRef.current !== token) return;
      swapped = true;
      hidden.setOpacity(targetOpacity);
      visible.setOpacity(0);
      activeLayerRef.current = activeIdx === 0 ? 1 : 0;
    };
    hidden.once('load', swap);
    hidden.setUrl(url);
    // Fallback: swap anyway if 'load' never fires (e.g. an instant/cached
    // load Leaflet doesn't report), so the animation can't silently stall.
    setTimeout(swap, SWAP_FALLBACK_MS);
    // opacity is only read for the very first layer's initial creation —
    // live opacity changes go through the dedicated effect below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, frameIndex]);

  // Opacity can change independently of the frame — apply to whichever layer is visible.
  useEffect(() => {
    const [a, b] = radarLayersRef.current;
    const visible = activeLayerRef.current === 0 ? a : b;
    visible?.setOpacity(opacity / 100);
  }, [opacity]);

  // Manual play: steps through frames on an interval, looping back to the
  // start. Unlike the earlier always-on auto-animate, this only runs while
  // the user has pressed play — the double-buffer preload above keeps each
  // step flicker-free regardless of whether the step was manual or timed.
  useEffect(() => {
    if (!isPlaying || !timeline || timeline.frames.length < 2) return;
    const id = setInterval(() => {
      setFrameIndex(i => (i + 1) % timeline.frames.length);
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPlaying, timeline]);

  const recenter = () => {
    if (!leafletMapRef.current || !hasLocation) return;
    // flyTo (not setView) so large zoom-level jumps still animate smoothly —
    // setView only animates when the change is small, otherwise it jumps.
    leafletMapRef.current.flyTo([data.latitude!, data.longitude!], DEFAULT_ZOOM, { duration: 0.6 });
  };

  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }),
    [],
  );
  const frame = timeline?.frames[frameIndex];
  const isForecastFrame = !!timeline && frameIndex >= timeline.pastCount;
  const isLiveFrame = !!timeline && frameIndex === timeline.pastCount - 1;
  const frameLabel = frame
    ? `${timeFormatter.format(frame.time * 1000)}${isLiveFrame ? ` · ${t('widget.rainRadar.live')}` : isForecastFrame ? ` · ${t('widget.rainRadar.forecast')}` : ''}`
    : '';

  if (!hasLocation) {
    return (
      <div className="sg-rainradar sg-rainradar--empty">
        <span className="sg-rainradar-empty-text">{t('widget.weather.noLocation')}</span>
        <span className="sg-rainradar-empty-hint">{t('widget.weather.openSettings')}</span>
      </div>
    );
  }

  const frameCount = timeline?.frames.length ?? 0;

  return (
    <div className="sg-rainradar">
      <div ref={mapRef} className="sg-rainradar-map" />
      {error && !timeline && (
        <div className="sg-rainradar-error-overlay">
          <span>{t('widget.rainRadar.error')}</span>
          <ActionButton variant="ghost" onClick={() => setRetryTick(n => n + 1)}>{t('widget.weather.retry')}</ActionButton>
        </div>
      )}
      <div className="sg-rainradar-recenter" onClick={e => e.stopPropagation()}>
        <IconButton
          variant="ghost"
          title={t('widget.rainRadar.recenter')}
          active={false}
          onClick={recenter}
          icon={<span aria-hidden="true">⌖</span>}
        />
      </div>
      {frameCount > 1 && (
        <div className="sg-rainradar-timeline" onClick={e => e.stopPropagation()}>
          <IconButton
            variant="ghost"
            title={isPlaying ? t('widget.rainRadar.pause') : t('widget.rainRadar.play')}
            active={false}
            onClick={() => setIsPlaying(p => !p)}
            icon={<span aria-hidden="true">{isPlaying ? '⏸' : '▶'}</span>}
          />
          <IconButton
            variant="ghost"
            title={t('widget.rainRadar.prevFrame')}
            active={false}
            onClick={() => { setIsPlaying(false); setFrameIndex(i => Math.max(0, i - 1)); }}
            icon={<span aria-hidden="true">‹</span>}
          />
          <div className="sg-rainradar-scrubber">
            <SettingsSlider
              ariaLabel={t('widget.rainRadar.frameScrubber')}
              value={frameIndex}
              onChange={i => { setIsPlaying(false); setFrameIndex(i); }}
              min={0}
              max={frameCount - 1}
              step={1}
              valueFormatter={() => frameLabel}
              onPointerDown={e => e.stopPropagation()}
            />
          </div>
          <IconButton
            variant="ghost"
            title={t('widget.rainRadar.nextFrame')}
            active={false}
            onClick={() => { setIsPlaying(false); setFrameIndex(i => Math.min(frameCount - 1, i + 1)); }}
            icon={<span aria-hidden="true">›</span>}
          />
        </div>
      )}
    </div>
  );
}
