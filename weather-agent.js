// ============================================================
// WEATHER-AGENT.JS
// Specialist agent that checks weather conditions for a
// destination during a specific travel period
// ============================================================

async function runWeatherAgent(destination, travelPeriod, claudeApiKey, onUpdate) {
  if (onUpdate) {
    onUpdate(`🌤️ Weather Agent checking conditions in ${destination}...`);
  }

  const searchQuery =
    `Typical weather in ${destination} during ${travelPeriod}. ` +
    `Include average, min and max temperature, rainfall, sunshine hours, ` +
    `and whether it is a good time for a holiday.`;

  const searchResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system:
        "You are a weather research assistant. Search the web and summarize " +
        "typical weather for the destination and travel period. Be specific " +
        "about temperatures and conditions.",
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: searchQuery }]
    })
  });

  const searchData = await searchResponse.json();

  if (searchData.error) {
    throw new Error(`Weather Agent API error: ${searchData.error.message}`);
  }

  const rawText = searchData.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  const formatResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:
        "Convert weather research into ONE JSON object only. No markdown. " +
        "Fields: destination, travel_period, avg_temp_celsius, min_temp_celsius, " +
        "max_temp_celsius, weather_description, rainfall_mm, sunshine_hours_per_day, " +
        "is_suitable, suitability_note, recommendation.",
      messages: [{
        role: "user",
        content:
          `Destination: ${destination}\nTravel period: ${travelPeriod}\n\n` +
          `Research:\n${rawText}`
      }]
    })
  });

  const formatData = await formatResponse.json();

  if (formatData.error) {
    throw new Error(`Weather Agent formatting error: ${formatData.error.message}`);
  }

  const formattedText = formatData.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  let weather = null;

  try {
    const clean = formattedText.replace(/```json|```/g, "").trim();
    weather = JSON.parse(clean);
  } catch {
    try {
      const match = formattedText.match(/\{[\s\S]*\}/);
      if (match) weather = JSON.parse(match[0]);
    } catch {
      weather = null;
    }
  }

  if (!weather || typeof weather !== "object") {
    weather = {
      destination,
      travel_period: travelPeriod,
      avg_temp_celsius: null,
      weather_description: "Weather data unavailable",
      is_suitable: null,
      suitability_note: "Could not retrieve weather data",
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
