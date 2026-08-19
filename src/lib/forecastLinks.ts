import type { WeatherData } from '../types/widget';

export type ForecastProvider = NonNullable<WeatherData['forecastProvider']>;

// WetterOnline URLs are city-slug based (e.g. /wetter/berlin), not lat/lon —
// best-effort slugify of the geocoded city name (first segment of
// locationName, "City, Admin, Country"). Uncommon/non-German names may 404
// on their site since there's no slug catalog to validate against.
function slugifyCityName(locationName: string): string {
  return locationName
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Builds a deep link to an external forecast site for the given provider; returns `null` if the required location data isn't available. */
export function getForecastUrl(
  provider: ForecastProvider,
  { latitude, longitude, locationName }: Pick<WeatherData, 'latitude' | 'longitude' | 'locationName'>,
): string | null {
  switch (provider) {
    case 'google': {
      const query = locationName ? locationName.split(',')[0].trim() : undefined;
      if (query) return `https://www.google.com/search?q=weather+${encodeURIComponent(query)}`;
      if (latitude === undefined || longitude === undefined) return null;
      return `https://www.google.com/search?q=weather+${latitude},${longitude}`;
    }
    case 'windy':
      if (latitude === undefined || longitude === undefined) return null;
      return `https://www.windy.com/?${latitude},${longitude},10`;
    case 'wetteronline': {
      if (!locationName) return null;
      const slug = slugifyCityName(locationName);
      if (!slug) return null;
      return `https://www.wetteronline.de/wetter/${slug}`;
    }
    default:
      return null;
  }
}
