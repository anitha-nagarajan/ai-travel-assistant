import { config } from "../config.js";
import { callClaude, extractText } from "../lib/anthropic.js";

const RECOMMENDATION_PROMPT = `You are a travel recommendation expert.
Analyse flight and weather results and present the TOP 3 options.

Format:
🏆 Here are your top 3 travel options!
[Three sections: BEST PICK, RUNNER-UP, THIRD OPTION — each with flight, cost, weather, why, booking link]
💡 MY RECOMMENDATION
[2-3 paragraphs]

Rules:
- Only use flight options from the data (each has is_direct flag).
- EUR prices; warm and clear.
- If user_preferences.direct_only is true: ONLY recommend options where is_direct is true.
  Do NOT mention "via", layovers, connections, or connecting airports.
  Label flights as "direct" or "nonstop".`;

function filterFlightResultsForPreferences(flightResults, preferences) {
  return flightResults
    .map((result) => {
      let options = result.options || [];
      if (preferences.direct_only) {
        options = options.filter((o) => o.is_direct === true);
      }
      return { ...result, options };
    })
    .filter((r) => r.found && r.options.length > 0);
}

export async function buildRecommendation(flightResults, weatherResults, preferences) {
  const successful = filterFlightResultsForPreferences(flightResults, preferences);

  if (successful.length === 0) {
    if (preferences.direct_only) {
      return `I searched all destinations and date windows but could not find **direct (nonstop)** flights matching your criteria.

This can happen when:
- No airline flies nonstop on those dates from your departure airport
- The route requires at least one connection

💡 Suggestions:
- Try different travel dates within your holiday period
- Consider a nearby departure airport with nonstop routes
- Or tell me you are open to connections and I can search again`;
    }

    return `I searched all destinations and date windows but could not find available flights.

Try allowing connections, widening your travel dates, or choosing a different departure airport.`;
  }

  const summary = successful.map((result) => {
    const weather = weatherResults.find(
      (w) =>
        w.airport_code === result.destination ||
        w.destination?.toLowerCase() === result.destination_city?.toLowerCase()
    );
    return {
      destination: result.destination,
      destination_city: result.destination_city,
      departure_date: result.departure_date,
      return_date: result.return_date,
      flights: result.options,
      weather: weather || null
    };
  });

  const directOnlyNote = preferences.direct_only
    ? "\n\nCRITICAL: User requires DIRECT FLIGHTS ONLY. Every flight in RESULTS has is_direct: true. Present them as nonstop. Do not invent connecting routes.\n"
    : "";

  const data = await callClaude({
    model: config.sonnetModel,
    max_tokens: 2000,
    system: RECOMMENDATION_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `USER PREFERENCES:\n${JSON.stringify(preferences, null, 2)}\n` +
          directOnlyNote +
          `\nRESULTS:\n${JSON.stringify(summary, null, 2)}`
      }
    ]
  });

  return extractText(data);
}
