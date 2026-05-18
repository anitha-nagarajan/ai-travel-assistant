// ============================================================
// DESTINATION-AGENT.JS
// Specialist agent that finds matching travel destinations
// based on the user's preferences
// ============================================================

const DESTINATION_AGENT_PROMPT = `You are a specialist Destination Research Agent.
Your ONLY job is to find the best matching travel destinations based on 
the user's travel preferences.

You will receive a set of preferences including:
- Departure airport(s)
- Maximum flying time
- Whether direct flights are required
- Continent or region preference
- Climate requirements
- Travel period
- Any other preferences

Using your web search tool, research and return EXACTLY 3 destinations that 
best match ALL the given criteria.

For each destination you MUST find and return:
- City name
- Country
- IATA airport code (3 letters e.g. BCN, LIS, ACE)
- Average temperature during the travel period
- Approximate flying hours from the departure airport
- Whether direct flights exist from the departure airport

IMPORTANT RULES:
- Always verify airport codes are correct IATA codes
- Only suggest destinations reachable within the specified flying time
- Prioritise destinations with direct flights if requested
- Consider the climate requirements carefully
- Return ONLY a valid JSON array — no explanation, no markdown

Output format (return ONLY this JSON, nothing else):
[
  {
    "city": "Lisbon",
    "country": "Portugal",
    "airport_code": "LIS",
    "avg_temp_celsius": 16,
    "flying_hours": 2.5,
    "has_direct_flights": true
  }
]`;


// ── Tool definition for this agent ──
const DESTINATION_AGENT_TOOLS = [
  {
    name: "search_destinations",
    description: `Search the web for travel destinations matching the given 
    criteria. Use this to find cities with the right climate, flying distance 
    and airport connections.`,
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: `The search query to find matching destinations e.g. 
          'warm destinations from Amsterdam max 4 hours flying December 2026'`
        }
      },
      required: ["query"]
    }
  }
];


// ── Main agent function ──
// Takes user preferences and returns a shortlist of 3 destinations
async function runDestinationAgent(preferences, claudeApiKey, onUpdate) {

  if (onUpdate) {
    onUpdate("🌍 Destination Agent searching for matching destinations...");
  }

  const searchQuery = `Best travel destinations from 
  ${preferences.departure_airports.join(" or ")} with these criteria:
  - Maximum flying time: ${preferences.max_flying_hours} hours
  - Direct flights preferred: ${preferences.direct_only ? "yes" : "no"}
  - Region preference: ${preferences.continent_preference || "anywhere"}
  - Climate: ${preferences.climate_preference || "pleasant weather"}
  - Travel period: ${preferences.travel_period}
  - Other: ${preferences.other_preferences || "none"}
  
  For each destination include: city name, country, IATA airport code, 
  average temperature in that period, flying hours from departure airport, 
  and whether direct flights exist.`;

  // ── Step 1: Search with web search (raw text result) ──
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
      system: `You are a travel research assistant. Search the web and find 
      3 destinations matching the user's criteria. Write a brief summary 
      of each destination including city, country, airport code, temperature, 
      flying time and whether direct flights exist. Be factual and specific.`,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: searchQuery }]
    })
  });

  const searchData = await searchResponse.json();

  if (searchData.error) {
    throw new Error(`Destination search error: ${searchData.error.message}`);
  }

  // Extract raw text from search response
  const rawText = searchData.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  // ── Step 2: Convert raw text to clean JSON (no web search) ──
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
      system: `You are a JSON formatter. Your ONLY job is to convert travel 
      destination information into a valid JSON array.
      
      Return ONLY this exact JSON structure — no explanation, 
      no markdown, no backticks, nothing else:
      [
        {
          "city": "string",
          "country": "string", 
          "airport_code": "string (3 letter IATA code)",
          "avg_temp_celsius": number,
          "flying_hours": number,
          "has_direct_flights": boolean
        }
      ]
      
      If any field is unknown, make a reasonable estimate.
      Always return exactly 3 destinations.`,
      messages: [{
        role: "user",
        content: `Convert this destination research into a JSON array of 
        exactly 3 destinations:\n\n${rawText}`
      }]
    })
  });

  const formatData = await formatResponse.json();

  if (formatData.error) {
    throw new Error(`Destination formatting error: ${formatData.error.message}`);
  }

  const formattedText = formatData.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  // ── Parse the clean JSON ──
  let destinations = null;

  // Attempt 1: Direct parse
  try {
    const clean = formattedText.replace(/```json|```/g, "").trim();
    destinations = JSON.parse(clean);
  } catch {
    // Attempt 2: Find array with regex
    try {
      const match = formattedText.match(/\[[\s\S]*\]/);
      if (match) destinations = JSON.parse(match[0]);
    } catch {
      destinations = null;
    }
  }

  // If both fail something is seriously wrong — throw a real error
  if (!destinations || !Array.isArray(destinations) || destinations.length === 0) {
    throw new Error(
      "Destination Agent could not find destinations matching your criteria. " +
      "Please try adjusting your preferences."
    );
  }

  if (onUpdate) {
    const names = destinations.map(d => d.city).join(", ");
    onUpdate(`✅ Destination Agent found: ${names}`);
  }

  return destinations;
}