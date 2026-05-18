// ============================================================
// RECOMMENDATION-AGENT.JS
// Specialist agent that receives all search results and
// produces a final ranked recommendation for the user.
// This agent uses NO tools — pure reasoning only.
// ============================================================

const RECOMMENDATION_AGENT_PROMPT = `You are a specialist Travel Recommendation Agent.
Your ONLY job is to analyse flight and weather results and produce a 
clear, friendly recommendation for the user.

You will receive:
- A list of flight search results (multiple destinations and windows)
- Weather data for each destination
- The user's original preferences

YOUR TASK:
1. Rank all options by overall value (price, weather, travel time, convenience)
2. Present the TOP 3 options clearly
3. Give a clear overall winner with reasoning

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

🏆 Here are your top 3 travel options!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ BEST PICK — [Destination] ([Dates])
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✈️ Flight: [Airline] — €[price]/person — [duration] — [stops]
💰 Total cost: €[total] for [X] passengers
🌡️ Weather: [temp]°C — [description]
📝 Why: [2-3 sentence explanation of why this is the best choice]
🔗 Book at: https://www.google.com/flights

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🥈 RUNNER-UP — [Destination] ([Dates])
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✈️ Flight: [Airline] — €[price]/person — [duration] — [stops]
💰 Total cost: €[total] for [X] passengers
🌡️ Weather: [temp]°C — [description]
📝 Why: [2-3 sentence explanation]
🔗 Book at: https://www.google.com/flights

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🥉 THIRD OPTION — [Destination] ([Dates])
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✈️ Flight: [Airline] — €[price]/person — [duration] — [stops]
💰 Total cost: €[total] for [X] passengers
🌡️ Weather: [temp]°C — [description]
📝 Why: [2-3 sentence explanation]
🔗 Book at: https://www.google.com/flights

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 MY RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2-3 paragraph summary comparing the options and giving a clear 
overall recommendation. Mention the best value, best weather and 
best overall balance. End with a practical next step for booking.]

IMPORTANT RULES:
- Only include options where flights were actually found (found: true)
- If fewer than 3 options have flights, show only those that do
- Always calculate total cost correctly for all passengers
- Be warm, friendly and encouraging
- Prices are in EUR unless stated otherwise`;


// ── Main agent function ──
// Receives all results and returns a formatted recommendation
async function runRecommendationAgent(
  flightResults,
  weatherResults,
  userPreferences,
  claudeApiKey,
  onUpdate
) {
  if (onUpdate) {
    onUpdate("⭐ Recommendation Agent analysing all results...");
  }

  // Filter to only destinations where flights were found
  const successfulFlights = flightResults.filter(r => r.found && r.options.length > 0);

  if (successfulFlights.length === 0) {
    return `I searched all destinations and travel windows but unfortunately 
could not find any available flights matching your criteria. 

This can happen when:
- The route doesn't have direct flights on those specific dates
- The destination airport code wasn't recognised
- Flight data wasn't available for that period

💡 Suggestions:
- Try allowing connections (not direct flights only)
- Extend your travel period slightly
- Try different departure airports

Would you like me to search again with adjusted preferences?`;
  }

  // Build a comprehensive summary for the recommendation agent
  const flightSummary = successfulFlights.map(result => {
    const weather = weatherResults.find(w => 
      w.destination.toLowerCase().includes(result.destination.toLowerCase()) ||
      result.destination.toLowerCase().includes(w.destination.toLowerCase())
    );

    return {
      destination:    result.destination,
      departure_date: result.departure_date,
      return_date:    result.return_date,
      flights:        result.options,
      weather:        weather || null
    };
  });

  const requestMessage = `
Here are the flight and weather results for the user's trip search.

USER PREFERENCES:
${JSON.stringify(userPreferences, null, 2)}

SEARCH RESULTS:
${JSON.stringify(flightSummary, null, 2)}

Please analyse these results and provide a clear top 3 recommendation 
following the exact format in your instructions.`;

  // Single API call — no tools needed, pure reasoning
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model:    "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system:   RECOMMENDATION_AGENT_PROMPT,
      messages: [{ role: "user", content: requestMessage }]
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Recommendation Agent error: ${data.error.message}`);
  }

  const recommendation = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  if (onUpdate) {
    onUpdate("✅ Recommendation Agent completed analysis!");
  }

  return recommendation;
}