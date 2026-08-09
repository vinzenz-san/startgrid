import { useEffect, useRef, useState } from 'react';
import { SettingsRow, SettingsSwitch } from '../shared/Form';
import { useSettings } from '../../contexts/SettingsContext';
import { useWeatherEffect } from '../../contexts/WeatherEffectContext';
import { geocodeCity, type GeocodeResult } from '../../lib/openMeteoApi';
import '../widgets/Weather/Weather.css';

const SEARCH_DEBOUNCE_MS = 450;

export default function WeatherEffectSettings() {
  const { t } = useSettings();
  const { enabled, hasLocation, locationName, setEnabled, setLocation } = useWeatherEffect();

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
    setLocation(r.latitude, r.longitude, label);
    setQuery('');
    setResults([]);
  };

  return (
    <div className="sg-weather-effect-settings">
      <SettingsRow label={t('weatherEffect.enable')}>
        <SettingsSwitch checked={enabled} onChange={setEnabled} />
      </SettingsRow>

      <SettingsRow label={t('widget.weather.searchCity')}>
        <input
          className="sg-weather-input"
          placeholder={t('widget.weather.searchPlaceholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
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

      {hasLocation && locationName && (
        <div className="sg-weather-current-location">{locationName}</div>
      )}

      {!hasLocation && <p className="bg-sync-warning">{t('weatherEffect.noLocation')}</p>}
    </div>
  );
}
