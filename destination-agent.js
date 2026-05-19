// ============================================================
// DESTINATION-AGENT.JS
// Finds matching destinations (single API call + local JSON parse)
// ============================================================

const DESTINATION_SYSTEM_PROMPT = `You are a destination research agent.
Search the web, then reply with ONLY a JSON array of exactly 3 destinations.
No markdown, no explanation, no text before or after the array.

Each object must have:
city, country, airport_code (3-letter IATA), avg_temp_celsius (number),
flying_hours (number), has_direct_flights (boolean).`;

async function runDestinationAgent(preferences, claudeApiKey, onUpdate) {
  if (onUpdate) {
    onUpdate("🌍 Destination Agent searching for matching destinations...");
  }

  const searchQuery =
    `From ${preferences.departure_airports.join("/")}, max ${preferences.max_flying_hours}h flight, ` +
    `direct flights: ${preferences.direct_only ? "required" : "optional"}, ` +
    `region: ${preferences.continent_preference || "any"}, ` +
    `climate: ${preferences.climate_preference || "pleasant"}, ` +
    `period: ${preferences.travel_period}. ` +
    `${preferences.other_preferences || ""}`;

  const data = await callClaude(
    {
      model: HAIKU_MODEL,
      max_tokens: 700,
      system: DESTINATION_SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: searchQuery }]
    },
    claudeApiKey,
    { onUpdate }
  );

  const text = extractTextFromResponse(data);
  let destinations = parseJsonArray(text);

  if (!destinations || destinations.length === 0) {
    throw new Error(
      "Destination Agent could not parse results. Please try again in a minute " +
      "(API rate limits reset quickly) or adjust your preferences."
    );
  }

  destinations = destinations.slice(0, 3).map(d => ({
    city: d.city,
    country: d.country,
    airport_code: normalizeAirportCode(d.airport_code || d.city),
    avg_temp_celsius: Number(d.avg_temp_celsius) || null,
    flying_hours: Number(d.flying_hours) || null,
    has_direct_flights: Boolean(d.has_direct_flights)
  }));

  if (onUpdate) {
    onUpdate(`✅ Destination Agent found: ${destinations.map(d => d.city).join(", ")}`);
  }

  return destinations;
}
