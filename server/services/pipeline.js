import { sleep, generateTravelWindows, normalizeAirportCode } from "../lib/utils.js";
import { searchFlights } from "../lib/serpapi.js";
import { getWeatherForDestination } from "../lib/openmeteo.js";
import { findDestinations } from "./destination.js";
import { buildRecommendation } from "./recommendation.js";

/**
 * @param {object} preferences
 * @param {(event: object) => void} emit
 */
export async function runSearchPipeline(preferences, emit) {
  const onRetry = (waitMs) => {
    emit({
      type: "progress",
      agent: "destination",
      message: `⏳ Rate limit — waiting ${Math.round(waitMs / 1000)}s...`,
      level: "warn"
    });
  };

  emit({
    type: "progress",
    agent: "destination",
    message: "🌍 Destination Agent finding matching cities..."
  });

  const destinations = await findDestinations(preferences, onRetry);
  emit({
    type: "progress",
    agent: "destination",
    message: `✅ Destinations: ${destinations.map((d) => d.city).join(", ")}`,
    level: "done"
  });

  const windows = generateTravelWindows(
    preferences.travel_period,
    preferences.trip_min_days,
    preferences.trip_max_days
  );

  emit({
    type: "progress",
    agent: "flight",
    message: `📅 Checking ${windows.length} windows × ${Math.min(destinations.length, 2)} destinations...`
  });

  const flightResults = [];
  const origin = preferences.departure_airports[0];

  for (const destination of destinations.slice(0, 2)) {
    const destCode = normalizeAirportCode(destination.airport_code);

    for (const window of windows) {
      await sleep(1500);

      emit({
        type: "progress",
        agent: "flight",
        message:
          `✈️ Searching ${origin} → ${destCode} ` +
          `(${window.departure_date} – ${window.return_date})...`
      });

      try {
        const result = await searchFlights({
          origin,
          destination: destCode,
          destination_city: destination.city,
          departure_date: window.departure_date,
          return_date: window.return_date,
          adults: preferences.adults,
          children: preferences.children,
          direct_only: preferences.direct_only
        });

        if (result.found) {
          const best = result.options[0];
          emit({
            type: "progress",
            agent: "flight",
            message:
              `✅ ${destCode}: €${best.price_eur}/person — ${best.airline}`,
            level: "done"
          });
          flightResults.push(result);
        } else {
          emit({
            type: "progress",
            agent: "flight",
            message: `⚠️ No flights for ${origin} → ${destCode}`,
            level: "warn"
          });
        }
      } catch (err) {
        emit({
          type: "progress",
          agent: "flight",
          message: `⚠️ Flight search error: ${err.message}`,
          level: "warn"
        });
      }
    }
  }

  const weatherResults = [];
  const seen = new Set();

  for (const result of flightResults) {
    const city = result.destination_city || result.destination;
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    emit({
      type: "progress",
      agent: "weather",
      message: `🌤️ Open-Meteo: weather for ${city}...`
    });

    try {
      const weather = await getWeatherForDestination(city, preferences.travel_period);
      weather.airport_code = result.destination;
      weatherResults.push(weather);
      emit({
        type: "progress",
        agent: "weather",
        message:
          `✅ ${city}: ${weather.avg_temp_celsius}°C — ${weather.weather_description}`,
        level: "done"
      });
    } catch (err) {
      emit({
        type: "progress",
        agent: "weather",
        message: `⚠️ Weather unavailable for ${city}: ${err.message}`,
        level: "warn"
      });
    }
  }

  emit({
    type: "progress",
    agent: "recommendation",
    message: "⭐ Recommendation Agent building your top 3 picks..."
  });

  const recommendation = await buildRecommendation(
    flightResults,
    weatherResults,
    preferences
  );

  emit({
    type: "progress",
    agent: "recommendation",
    message: "✅ Recommendation ready!",
    level: "done"
  });

  emit({ type: "complete", recommendation });
}
