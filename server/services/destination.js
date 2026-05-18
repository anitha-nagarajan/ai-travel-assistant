import { config } from "../config.js";
import { callClaude, extractText } from "../lib/anthropic.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { normalizeAirportCode, parseJsonArray } from "../lib/utils.js";

const DESTINATION_PROMPT = `You are a travel destination expert.
Return ONLY a JSON array of exactly 3 destinations matching the criteria.
Each object: city, country, airport_code (IATA), avg_temp_celsius, flying_hours, has_direct_flights.
No markdown or explanation.`;

export async function findDestinations(preferences, onRetry) {
  const cacheKey = `dest:${JSON.stringify({
    from: preferences.departure_airports,
    h: preferences.max_flying_hours,
    d: preferences.direct_only,
    r: preferences.continent_preference,
    c: preferences.climate_preference,
    p: preferences.travel_period
  })}`;

  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const query =
    `Departure: ${preferences.departure_airports.join("/")}. ` +
    `Max flight ${preferences.max_flying_hours}h. ` +
    `Direct only: ${preferences.direct_only}. ` +
    `Region: ${preferences.continent_preference || "any"}. ` +
    `Climate: ${preferences.climate_preference || "pleasant"}. ` +
    `Period: ${preferences.travel_period}. ` +
    `Notes: ${preferences.other_preferences || "none"}.`;

  const data = await callClaude(
    {
      model: config.haikuModel,
      max_tokens: 700,
      system: DESTINATION_PROMPT,
      messages: [{ role: "user", content: query }]
    },
    { onRetry }
  );

  const destinations = parseJsonArray(extractText(data));
  if (!destinations?.length) {
    throw new Error("Could not generate destination shortlist.");
  }

  const normalized = destinations.slice(0, 3).map((d) => ({
    city: d.city,
    country: d.country,
    airport_code: normalizeAirportCode(d.airport_code || d.city),
    avg_temp_celsius: Number(d.avg_temp_celsius) || null,
    flying_hours: Number(d.flying_hours) || null,
    has_direct_flights: Boolean(d.has_direct_flights)
  }));

  cacheSet(cacheKey, normalized);
  return normalized;
}
