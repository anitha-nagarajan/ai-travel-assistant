// ============================================================
// WEATHER-AGENT.JS
// Weather for a destination (single API call + local JSON parse)
// ============================================================

const WEATHER_SYSTEM_PROMPT = `You are a weather research agent.
Search the web, then reply with ONLY one JSON object (no markdown).
Fields: destination, travel_period, avg_temp_celsius, min_temp_celsius,
max_temp_celsius, weather_description, rainfall_mm, sunshine_hours_per_day,
is_suitable, suitability_note, recommendation.`;

async function runWeatherAgent(destination, travelPeriod, claudeApiKey, onUpdate) {
  if (onUpdate) {
    onUpdate(`🌤️ Weather Agent checking conditions in ${destination}...`);
  }

  const searchQuery =
    `Typical weather in ${destination} during ${travelPeriod}. ` +
    `Historical averages for tourists.`;

  const data = await callClaude(
    {
      model: HAIKU_MODEL,
      max_tokens: 500,
      system: WEATHER_SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: searchQuery }]
    },
    claudeApiKey,
    { onUpdate }
  );

  const text = extractTextFromResponse(data);
  let weather = parseJsonObject(text);

  if (!weather) {
    weather = {
      destination,
      travel_period: travelPeriod,
      avg_temp_celsius: null,
      weather_description: "Weather data unavailable",
      is_suitable: null,
      suitability_note: "Could not parse weather response",
      recommendation: "Check weather closer to your travel date"
    };
  } else {
    weather.destination = weather.destination || destination;
    weather.travel_period = weather.travel_period || travelPeriod;
  }

  if (onUpdate && weather.avg_temp_celsius != null) {
    onUpdate(
      `✅ ${destination}: ${weather.avg_temp_celsius}°C — ` +
      `${weather.weather_description || "conditions checked"}`
    );
  } else if (onUpdate) {
    onUpdate(`✅ Weather checked for ${destination}`);
  }

  return weather;
}
