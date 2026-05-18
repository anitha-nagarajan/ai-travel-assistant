// ============================================================
// WEATHER-AGENT.JS
// Specialist agent that checks weather conditions for a
// destination during a specific travel period
// ============================================================

const WEATHER_AGENT_PROMPT = `You are a specialist Weather Research Agent.
Your ONLY job is to find accurate weather information for a travel 
destination during a specific period.

You will receive:
- A destination city
- A travel period (specific dates or month range)

Using your web search tool, find the typical/average weather for that 
destination during that period.

You MUST return ONLY a valid JSON object — no explanation, no markdown.

Output format (return ONLY this JSON, nothing else):
{
  "destination": "Lisbon",
  "travel_period": "20-27 December",
  "avg_temp_celsius": 16,
  "min_temp_celsius": 11,
  "max_temp_celsius": 19,
  "weather_description": "Mild and partly cloudy",
  "rainfall_mm": 80,
  "sunshine_hours_per_day": 5,
  "is_suitable": true,
  "suitability_note": "Mild winter weather, good for sightseeing",
  "recommendation": "Pack a light jacket and layers"
}

IMPORTANT RULES:
- Base your answer on historical averages for that time of year
- is_suitable should be true if weather matches typical holiday expectations
- Be specific about temperatures — do not round to nearest 5
- Always include a practical packing recommendation`;


// ── Tool definition for this agent ──
const WEATHER_AGENT_TOOLS = [
  {
    name: "search_weather",
    description: `Search the web for weather information for a specific 
    destination and travel period. Find historical averages and typical 
    conditions.`,
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: `Weather search query e.g. 
          'average weather Lisbon December temperature rainfall'`
        }
      },
      required: ["query"]
    }
  }
];


// ── Main agent function ──
// Takes a destination and travel period, returns weather data
async function runWeatherAgent(destination, travelPeriod, claudeApiKey, onUpdate) {

  if (onUpdate) {
    onUpdate(`🌤️ Weather Agent checking conditions in ${destination}...`);
  }

  const requestMessage = `Find the typical weather for ${destination} 
  during ${travelPeriod}. 
  Search for historical averages including temperature, rainfall 
  and sunshine hours. Return as JSON.`;

  const messages = [{ role: "user", content: requestMessage }];

  // Agent loop
  while (true) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: WEATHER_AGENT_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Weather Agent API error: ${data.error.message}`);
    }

    messages.push({ role: "assistant", content: data.content });

    // Agent finished — extract JSON result
    if (data.stop_reason === "end_turn") {
      const text = data.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      try {
        const clean = text.replace(/```json|```/g, "").trim();
        const weather = JSON.parse(clean);

        if (onUpdate) {
          onUpdate(
            `✅ ${destination}: ${weather.avg_temp_celsius}°C — ` +
            `${weather.weather_description}`
          );
        }

        return weather;

      } catch {
        console.error("Weather Agent JSON parse error:", text);
        // Return a safe fallback rather than crashing
        return {
          destination,
          travel_period: travelPeriod,
          avg_temp_celsius: null,
          weather_description: "Weather data unavailable",
          is_suitable: null,
          suitability_note: "Could not retrieve weather data",
          recommendation: "Check weather closer to travel date"
        };
      }
    }

    // Handle tool use (web search)
    if (data.stop_reason === "tool_use") {
      const toolResults = [];

      for (const block of data.content) {
        if (block.type === "tool_use") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Search completed."
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }
}