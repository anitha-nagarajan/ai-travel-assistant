import { cacheGet, cacheSet } from "./cache.js";
import { parseTravelDateRange } from "./utils.js";

const WMO_DESCRIPTIONS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm"
};

function wmoLabel(code) {
  return WMO_DESCRIPTIONS[code] || "Variable conditions";
}

async function geocodeCity(city) {
  const key = `geo:${city.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const url =
    `https://geocoding-api.open-meteo.com/v1/search?` +
    new URLSearchParams({ name: city, count: "1", language: "en", format: "json" });

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Geocoding failed for ${city}`);

  const data = await response.json();
  const place = data.results?.[0];
  if (!place) throw new Error(`Could not find location: ${city}`);

  const result = {
    name: place.name,
    country: place.country,
    latitude: place.latitude,
    longitude: place.longitude
  };
  cacheSet(key, result);
  return result;
}

function resolveWeatherDateRange(range) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(range.start + "T12:00:00");
  const end = new Date(range.end + "T12:00:00");
  const maxForecast = new Date(today);
  maxForecast.setDate(maxForecast.getDate() + 14);

  // Forecast only reaches ~16 days ahead — use last year's dates for seasonal norms
  if (start > maxForecast) {
    start.setFullYear(start.getFullYear() - 1);
    end.setFullYear(end.getFullYear() - 1);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      mode: "archive",
      note: "seasonal estimate from prior year"
    };
  }

  return {
    start: range.start,
    end: range.end,
    mode: start >= today ? "forecast" : "archive",
    note: null
  };
}

export async function getWeatherForDestination(city, travelPeriod) {
  const cacheKey = `weather:${city.toLowerCase()}:${travelPeriod}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const geo = await geocodeCity(city);
  const range = parseTravelDateRange(travelPeriod);
  if (!range) {
    throw new Error(`Could not parse travel period: ${travelPeriod}`);
  }

  const daily =
    "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,sunshine_duration";
  const params = new URLSearchParams({
    latitude: String(geo.latitude),
    longitude: String(geo.longitude),
    start_date: range.start,
    end_date: range.end,
    daily,
    timezone: "auto"
  });

  const resolved = resolveWeatherDateRange(range);
  params.set("start_date", resolved.start);
  params.set("end_date", resolved.end);

  const baseUrl =
    resolved.mode === "forecast"
      ? "https://api.open-meteo.com/v1/forecast"
      : "https://archive-api.open-meteo.com/v1/archive";

  const response = await fetch(`${baseUrl}?${params}`);
  if (!response.ok) throw new Error(`Open-Meteo error for ${city}`);

  const data = await response.json();
  const d = data.daily;
  if (!d?.temperature_2m_max?.length) {
    throw new Error(`No weather data for ${city}`);
  }

  const avgMax =
    d.temperature_2m_max.reduce((a, b) => a + b, 0) / d.temperature_2m_max.length;
  const avgMin =
    d.temperature_2m_min.reduce((a, b) => a + b, 0) / d.temperature_2m_min.length;
  const totalRain = d.precipitation_sum.reduce((a, b) => a + b, 0);
  const avgCode = Math.round(
    d.weathercode.reduce((a, b) => a + b, 0) / d.weathercode.length
  );
  const sunshineHours =
    d.sunshine_duration?.length > 0
      ? Math.round(
          d.sunshine_duration.reduce((a, b) => a + b, 0) / d.sunshine_duration.length / 3600
        )
      : null;

  const avgTemp = Math.round(((avgMax + avgMin) / 2) * 10) / 10;
  const description = wmoLabel(avgCode);

  const weather = {
    destination: geo.name,
    country: geo.country,
    travel_period: travelPeriod,
    date_range: range,
    avg_temp_celsius: avgTemp,
    min_temp_celsius: Math.round(Math.min(...d.temperature_2m_min) * 10) / 10,
    max_temp_celsius: Math.round(Math.max(...d.temperature_2m_max) * 10) / 10,
    weather_description: description,
    rainfall_mm: Math.round(totalRain * 10) / 10,
    sunshine_hours_per_day: sunshineHours,
    is_suitable: avgTemp >= 12 && totalRain < 80,
    suitability_note:
      avgTemp >= 18
        ? "Generally pleasant for a holiday"
        : avgTemp >= 12
          ? "Cool but workable with layers"
          : "Quite cold for beach holidays",
    recommendation:
      avgTemp >= 18
        ? "Pack light layers and sun protection"
        : "Pack a warm jacket and waterproof layer",
    source: "Open-Meteo",
    estimate_note: resolved.note
  };

  cacheSet(cacheKey, weather);
  return weather;
}
