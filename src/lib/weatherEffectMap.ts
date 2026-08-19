// Coarser grouping than weatherCodes.ts's 12 display conditions — collapses
// WMO codes down to the handful of particle systems WeatherEffect actually
// renders. Only rain and snow are implemented; every other condition
// (clear, clouds, fog, thunderstorm) falls through to 'none'.
export type WeatherEffectType = 'rain' | 'snow' | 'none';

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

/** Maps a WMO weather code to the particle effect to render; anything not rain/snow returns `'none'`. */
export function getWeatherEffectType(code: number): WeatherEffectType {
  if (RAIN_CODES.has(code)) return 'rain';
  if (SNOW_CODES.has(code)) return 'snow';
  return 'none';
}
