import { useEffect, useRef, useState } from 'react';
import type { WeatherData, WidgetAlignment } from '../../../types/widget';
import { SettingsRow, Dropdown, SettingsSwitch, SettingsSlider, ActionButton } from '../../shared/Form';
import { DisplaySettingsPanel } from '../../shared/Form';
import { DetailedSettings } from '../../Layout/DetailedSettings';
import { useSettings } from '../../../contexts/SettingsContext';
import { useWeather } from '../../../hooks/useWeather';
import { useWeatherForecast } from '../../../hooks/useWeatherForecast';
import { geocodeCity, type GeocodeResult } from '../../../lib/openMeteoApi';
import { getForecastUrl, type ForecastProvider } from '../../../lib/forecastLinks';
import { getWeatherCodeInfo } from '../../../lib/weatherCodes';
import { resolveDisplayStyle, scaledFontSize } from '../../../lib/displayStyle';
import { useClickDragGuard } from '../../../lib/clickDragGuard';
import './Weather.css';

// Weather's old fixed sizes (icon 42 / temp 28 / condition 13 / feelslike+location
// 12) — kept as ratios off the Font Size slider (anchored to temp, the widget's
// primary text) so every line keeps scaling together instead of only the temp.
const DEFAULT_TEMP_SIZE = 28;
const ICON_SIZE_RATIO       = 42 / 28;
const CONDITION_SIZE_RATIO  = 13 / 28;
const SECONDARY_SIZE_RATIO  = 12 / 28;

const SEARCH_DEBOUNCE_MS = 450;
const DEFAULT_FORECAST_DAYS = 5;

// ── Settings ───────────────────────────────────────────────────────────────

interface SettingsProps {
  data: WeatherData;
  onUpdateData: (patch: Partial<WeatherData>) => void;
}

export function WeatherSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const units            = data.units ?? 'metric';
  const showFeelsLike     = data.showFeelsLike ?? true;
  const showLocationName  = data.showLocationName ?? true;
  const alignment         = data.alignment ?? 'left';

  const ALIGNMENT_OPTIONS: { value: WidgetAlignment; label: string }[] = [
    { value: 'left',   label: t('widget.quicklinks.align.left') },
    { value: 'center', label: t('widget.quicklinks.align.center') },
    { value: 'right',  label: t('widget.quicklinks.align.right') },
    { value: 'top',    label: t('widget.quicklinks.align.top') },
    { value: 'bottom', label: t('widget.quicklinks.align.bottom') },
  ];

  const [query, setQuery]     = useState('');
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
        const r = await geocodeCity(q);
        setResults(r);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const selectResult = (r: GeocodeResult) => {
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
    onUpdateData({
      locationName: label,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
    });
    setQuery('');
    setResults([]);
  };

  return (
    <div className="sg-weather-settings" onClick={e => e.stopPropagation()}>
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

      <SettingsRow label={t('widget.weather.units')}>
        <Dropdown
          options={[
            { value: 'metric',   label: t('widget.weather.unitsMetric') },
            { value: 'imperial', label: t('widget.weather.unitsImperial') },
          ]}
          value={units}
          onChange={v => onUpdateData({ units: v as WeatherData['units'] })}
        />
      </SettingsRow>

      <SettingsRow label={t('widget.weather.showFeelsLike')}>
        <SettingsSwitch checked={showFeelsLike} onChange={v => onUpdateData({ showFeelsLike: v })} />
      </SettingsRow>

      <SettingsRow label={t('widget.weather.showLocationName')}>
        <SettingsSwitch checked={showLocationName} onChange={v => onUpdateData({ showLocationName: v })} />
      </SettingsRow>

      <SettingsRow label={t('widget.greeting.alignment')}>
        <Dropdown
          options={ALIGNMENT_OPTIONS}
          value={alignment}
          onChange={v => onUpdateData({ alignment: v })}
        />
      </SettingsRow>

      <SettingsRow label={t('widget.allowOverflow')}>
        <SettingsSwitch checked={data.allowOverflow ?? false} onChange={v => onUpdateData({ allowOverflow: v })} />
      </SettingsRow>

      <SettingsRow label={t('widget.weather.openForecastOnClick')}>
        <SettingsSwitch
          checked={data.openForecastOnClick ?? false}
          onChange={v => onUpdateData({ openForecastOnClick: v })}
        />
      </SettingsRow>

      {data.openForecastOnClick && (
        <SettingsRow label={t('widget.weather.forecastProvider')}>
          <Dropdown
            options={[
              { value: 'google',       label: t('widget.weather.forecastProvider.google') },
              { value: 'windy',        label: t('widget.weather.forecastProvider.windy') },
              { value: 'wetteronline', label: t('widget.weather.forecastProvider.wetteronline') },
            ]}
            value={data.forecastProvider ?? 'google'}
            onChange={v => onUpdateData({ forecastProvider: v as ForecastProvider })}
          />
        </SettingsRow>
      )}

      <SettingsRow label={t('widget.weather.showForecast')}>
        <SettingsSwitch
          checked={data.showForecast ?? false}
          onChange={v => onUpdateData({ showForecast: v })}
        />
      </SettingsRow>

      {data.showForecast && (
        <SettingsSlider
          label={t('widget.weather.forecastDays')}
          value={data.forecastDays ?? DEFAULT_FORECAST_DAYS}
          min={3}
          max={7}
          step={1}
          valueFormatter={v => String(v)}
          onChange={v => onUpdateData({ forecastDays: v })}
          defaultValue={DEFAULT_FORECAST_DAYS}
        />
      )}

      <DetailedSettings title={t('widget.displaySettings.title')}>
        <DisplaySettingsPanel
          value={data.displaySettings}
          onChange={patch => onUpdateData({ displaySettings: { ...data.displaySettings, ...patch } })}
        />
      </DetailedSettings>
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────

interface Props {
  data: WeatherData;
  onUpdateData: (patch: Partial<WeatherData>) => void;
}

export default function Weather({ data }: Props) {
  const { t } = useSettings();
  const { onPointerDown, guardClick } = useClickDragGuard();
  const units           = data.units ?? 'metric';
  const showFeelsLike    = data.showFeelsLike ?? true;
  const showLocationName = data.showLocationName ?? true;
  const alignment        = data.alignment ?? 'left';

  const { weather, isFetching, error, isStale, refetch } = useWeather({
    latitude: data.latitude,
    longitude: data.longitude,
    units,
  });

  const showForecast = data.showForecast ?? false;
  const forecastDays = data.forecastDays ?? DEFAULT_FORECAST_DAYS;
  const { forecast } = useWeatherForecast({
    latitude: data.latitude,
    longitude: data.longitude,
    units,
    days: forecastDays,
    enabled: showForecast,
  });

  const hasLocation = data.latitude !== undefined && data.longitude !== undefined;
  const unitSuffix = units === 'imperial' ? '°F' : '°C';

  if (!hasLocation) {
    return (
      <div className="sg-weather sg-weather--empty">
        <span className="sg-weather-empty-text">{t('widget.weather.noLocation')}</span>
        <span className="sg-weather-empty-hint">{t('widget.weather.openSettings')}</span>
      </div>
    );
  }

  if (isFetching && !weather) {
    return (
      <div className="sg-weather sg-weather--empty">
        <span className="sg-weather-empty-text">{t('widget.weather.loading')}</span>
      </div>
    );
  }

  if (error && !weather) {
    return (
      <div className="sg-weather sg-weather--empty">
        <span className="sg-weather-empty-text">{t('widget.weather.error')}</span>
        <ActionButton variant="ghost" onClick={refetch}>{t('widget.weather.retry')}</ActionButton>
      </div>
    );
  }

  if (!weather) return null;

  const info = getWeatherCodeInfo(weather.weatherCode);
  const temp = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(weather.temperature);
  const feelsLike = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(weather.feelsLike);

  const { wrapper } = resolveDisplayStyle(data.displaySettings, DEFAULT_TEMP_SIZE);
  const tempSize      = scaledFontSize(DEFAULT_TEMP_SIZE);
  const iconSize      = scaledFontSize(DEFAULT_TEMP_SIZE * ICON_SIZE_RATIO);
  const conditionSize = scaledFontSize(DEFAULT_TEMP_SIZE * CONDITION_SIZE_RATIO);
  const secondarySize = scaledFontSize(DEFAULT_TEMP_SIZE * SECONDARY_SIZE_RATIO);

  const forecastUrl = data.openForecastOnClick
    ? getForecastUrl(data.forecastProvider ?? 'google', data)
    : null;
  const openForecast = forecastUrl
    ? () => window.open(forecastUrl, '_blank', 'noopener')
    : undefined;

  const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

  return (
    <div
      className={`sg-weather sg-weather--align-${alignment}${data.allowOverflow ? ' sg-weather--overflow' : ''}${openForecast ? ' sg-weather--clickable' : ''}${showForecast ? ' sg-weather--with-forecast' : ''}`}
      style={wrapper}
      onPointerDown={onPointerDown}
      onClick={e => { if (openForecast) guardClick(e, openForecast); }}
    >
      <div className="sg-weather-current">
        <div className="sg-weather-icon" style={{ fontSize: iconSize }}>{info.icon}</div>
        <div className="sg-weather-main">
          <div className="sg-weather-temp" style={{ fontSize: tempSize }}>
            {temp}{unitSuffix}
            {isStale && <span className="sg-weather-stale-dot" title={t('widget.weather.stale')} />}
          </div>
          <div className="sg-weather-condition" style={{ fontSize: conditionSize }}>{t(info.labelKey)}</div>
          {showFeelsLike && (
            <div className="sg-weather-feelslike" style={{ fontSize: secondarySize }}>{t('widget.weather.feelsLike', { value: `${feelsLike}${unitSuffix}` })}</div>
          )}
          {showLocationName && data.locationName && (
            // Stored locationName is "City, State, Country" (built for the
            // settings-panel search results, where the full name disambiguates
            // similarly-named cities); the widget face only ever shows the city.
            <div className="sg-weather-location" style={{ fontSize: secondarySize }}>{data.locationName.split(',')[0].trim()}</div>
          )}
        </div>
      </div>

      {showForecast && forecast && (
        <div className="sg-weather-forecast">
          {forecast.map(day => {
            const dayInfo = getWeatherCodeInfo(day.weatherCode);
            // +T00:00 avoids the browser interpreting a bare "YYYY-MM-DD"
            // as UTC midnight, which can roll over to the wrong local day.
            const label = dayFormatter.format(new Date(`${day.date}T00:00:00`));
            return (
              <div className="sg-weather-forecast-day" key={day.date}>
                <span className="sg-weather-forecast-day-label">{label}</span>
                <span className="sg-weather-forecast-day-icon">{dayInfo.icon}</span>
                <span className="sg-weather-forecast-day-temps">
                  <span className="sg-weather-forecast-day-max">{Math.round(day.tempMax)}°</span>
                  <span className="sg-weather-forecast-day-min">{Math.round(day.tempMin)}°</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
