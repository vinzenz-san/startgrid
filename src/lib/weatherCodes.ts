// Maps WMO weather interpretation codes (as returned by Open-Meteo's
// `weather_code` field) to a display icon + i18n condition label. Codes are
// grouped into ~12 user-facing conditions rather than translating all ~28
// individually.
import type { TranslationKey } from '../i18n';

export interface WeatherCodeInfo {
  icon: string;
  labelKey: TranslationKey;
}

const CLEAR: WeatherCodeInfo        = { icon: '☀️', labelKey: 'widget.weather.condition.clear' };
const MAINLY_CLEAR: WeatherCodeInfo = { icon: '🌤️', labelKey: 'widget.weather.condition.mainlyClear' };
const PARTLY_CLOUDY: WeatherCodeInfo = { icon: '⛅', labelKey: 'widget.weather.condition.partlyCloudy' };
const OVERCAST: WeatherCodeInfo     = { icon: '☁️', labelKey: 'widget.weather.condition.overcast' };
const FOG: WeatherCodeInfo          = { icon: '🌫️', labelKey: 'widget.weather.condition.fog' };
const DRIZZLE: WeatherCodeInfo      = { icon: '🌦️', labelKey: 'widget.weather.condition.drizzle' };
const RAIN: WeatherCodeInfo         = { icon: '🌧️', labelKey: 'widget.weather.condition.rain' };
const FREEZING_RAIN: WeatherCodeInfo = { icon: '🧊', labelKey: 'widget.weather.condition.freezingRain' };
const SNOW: WeatherCodeInfo         = { icon: '❄️', labelKey: 'widget.weather.condition.snow' };
const RAIN_SHOWERS: WeatherCodeInfo = { icon: '🌦️', labelKey: 'widget.weather.condition.rainShowers' };
const SNOW_SHOWERS: WeatherCodeInfo = { icon: '🌨️', labelKey: 'widget.weather.condition.snowShowers' };
const THUNDERSTORM: WeatherCodeInfo = { icon: '⛈️', labelKey: 'widget.weather.condition.thunderstorm' };

export const WEATHER_CODE_MAP: Record<number, WeatherCodeInfo> = {
  0: CLEAR,
  1: MAINLY_CLEAR,
  2: PARTLY_CLOUDY,
  3: OVERCAST,
  45: FOG, 48: FOG,
  51: DRIZZLE, 53: DRIZZLE, 55: DRIZZLE,
  56: FREEZING_RAIN, 57: FREEZING_RAIN,
  61: RAIN, 63: RAIN, 65: RAIN,
  66: FREEZING_RAIN, 67: FREEZING_RAIN,
  71: SNOW, 73: SNOW, 75: SNOW, 77: SNOW,
  80: RAIN_SHOWERS, 81: RAIN_SHOWERS, 82: RAIN_SHOWERS,
  85: SNOW_SHOWERS, 86: SNOW_SHOWERS,
  95: THUNDERSTORM, 96: THUNDERSTORM, 99: THUNDERSTORM,
};

/** Looks up the icon/label for a WMO weather code; unknown codes fall back to `OVERCAST`. */
export function getWeatherCodeInfo(code: number): WeatherCodeInfo {
  return WEATHER_CODE_MAP[code] ?? OVERCAST;
}
