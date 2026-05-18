import { config } from "../config.js";
import { callClaude, extractText } from "../lib/anthropic.js";

const RECOMMENDATION_PROMPT = `You are a travel recommendation expert.
Analyse flight and weather results and present the TOP 3 options.

Format:
🏆 Here are your top 3 travel options!
[Three sections: BEST PICK, RUNNER-UP, THIRD OPTION — each with flight, cost, weather, why, booking link]
💡 MY RECOMMENDATION
[2-3 paragraphs]

Rules: only options with flights found; EUR prices; warm and clear.`;

export async function buildRecommendation(flightResults, weatherResults, preferences) {
  const successful = flightResults.filter((r) => r.found && r.options?.length > 0);

  if (successful.length === 0) {
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

  const data = await callClaude({
    model: config.sonnetModel,
    max_tokens: 2000,
    system: RECOMMENDATION_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `USER PREFERENCES:\n${JSON.stringify(preferences, null, 2)}\n\n` +
          `RESULTS:\n${JSON.stringify(summary, null, 2)}`
      }
    ]
  });

  return extractText(data);
}
