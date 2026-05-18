// ============================================================
// FLIGHT-AGENT.JS
// Specialist agent that searches for real flights using
// SerpApi Google Flights. This agent handles all flight
// search logic, error handling and retries.
// ============================================================

const FLIGHT_AGENT_PROMPT = `You are a specialist Flight Search Agent.
Your ONLY job is to search for flights using the search_flights tool 
and return structured results.

You will receive:
- Origin airport code
- Destination airport code  
- Departure date (YYYY-MM-DD)
- Return date (YYYY-MM-DD)
- Number of adults
- Number of children
- Whether direct flights only

RULES:
1. Always call the search_flights tool with the exact parameters given
2. If the first search returns no results, retry once with direct_only set to false
3. If the destination code looks like a city name rather than an airport code,
   convert it to the correct IATA code first
4. Return ONLY valid JSON — no explanation, no markdown

Output format (return ONLY this JSON):
{
  "origin": "AMS",
  "destination": "LIS",
  "departure_date": "2026-12-20",
  "return_date": "2026-12-27",
  "found": true,
  "options": [
    {
      "price_eur": 189,
      "price_total_eur": 756,
      "airline": "TAP Air Portugal",
      "duration_minutes": 155,
      "stops": 0,
      "departure_time": "07:30",
      "arrival_time": "09:45"
    }
  ]
}

If no flights are found return:
{
  "origin": "AMS",
  "destination": "LIS", 
  "found": false,
  "options": []
}`;


// ── Tool definition for this agent ──
const FLIGHT_AGENT_TOOLS = [
  {
    name: "search_flights",
    description: `Search for real-time flight prices using SerpApi Google 
    Flights. Returns available flights with prices, airlines and durations.`,
    input_schema: {
      type: "object",
      properties: {
        origin: {
          type: "string",
          description: "Departure airport IATA code e.g. AMS, NRN, BRU"
        },
        destination: {
          type: "string",
          description: "Arrival airport IATA code e.g. LIS, ACE, BCN"
        },
        departure_date: {
          type: "string",
          description: "Departure date in YYYY-MM-DD format"
        },
        return_date: {
          type: "string",
          description: "Return date in YYYY-MM-DD format"
        },
        adults: {
          type: "integer",
          description: "Number of adult passengers"
        },
        children: {
          type: "integer",
          description: "Number of child passengers (0 if none)"
        },
        direct_only: {
          type: "boolean",
          description: "True for direct flights only, false to include connections"
        }
      },
      required: [
        "origin",
        "destination",
        "departure_date",
        "return_date",
        "adults"
      ]
    }
  }
];


// ── SerpApi call — the actual flight search ──
async function callSerpApi(params, serpApiKey) {
  const searchParams = new URLSearchParams({
    engine:         "google_flights",
    departure_id:   params.origin,
    arrival_id:     params.destination,
    outbound_date:  params.departure_date,
    return_date:    params.return_date,
    adults:         String(params.adults || 1),
    children:       String(params.children || 0),
    currency:       "EUR",
    gl:             "nl",
    hl:             "en",
    type:           "1",
    api_key:        serpApiKey
  });

  // Add stops filter for direct flights only
  if (params.direct_only) {
    searchParams.append("stops", "0");
  }

  // CORS proxy allows browser to call SerpApi directly
  const url =
    `https://corsproxy.io/?` +
    encodeURIComponent(
      `https://serpapi.com/search?${searchParams.toString()}`
    );

  const response = await fetch(url, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error(
      `SerpApi HTTP error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // SerpApi returns its own error field
  if (data.error) {
    throw new Error(`SerpApi error: ${data.error}`);
  }

  return data;
}


// ── Process raw SerpApi response into clean flight options ──
function processFlightResults(data, input, totalPassengers) {
  const rawFlights = data.best_flights || data.other_flights || [];

  if (rawFlights.length === 0) {
    return { found: false, options: [] };
  }

  const options = rawFlights.slice(0, 3).map(flight => {
    const firstLeg  = flight.flights[0];
    const lastLeg   = flight.flights[flight.flights.length - 1];

    return {
      price_eur:        flight.price,
      price_total_eur:  Math.round(flight.price * totalPassengers),
      airline:          firstLeg.airline,
      duration_minutes: flight.total_duration,
      stops:            flight.flights.length - 1,
      departure_time:   firstLeg.departure_airport.time,
      arrival_time:     lastLeg.arrival_airport.time
    };
  });

  return { found: true, options };
}


// ── Main agent function ──
async function runFlightAgent(
  searchParams,
  serpApiKey,
  claudeApiKey,
  onUpdate
) {
  const { origin, destination, departure_date, return_date,
          adults, children, direct_only } = searchParams;

  const totalPassengers = (adults || 1) + (children || 0);

  if (onUpdate) {
    onUpdate(
      `✈️ Flight Agent: searching ${origin} → ${destination} ` +
      `(${formatFlightDate(departure_date)} – ${formatFlightDate(return_date)})...`
    );
  }

  const messages = [
    {
      role: "user",
      content:
        `Search for flights: ${origin} → ${destination}, ` +
        `departing ${departure_date}, returning ${return_date}, ` +
        `${adults} adult(s), ${children || 0} child(ren), ` +
        `direct only: ${direct_only ? "yes" : "no"}. ` +
        `Use the search_flights tool and return results as JSON.`
    }
  ];

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
        model:    "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system:   FLIGHT_AGENT_PROMPT,
        tools:    FLIGHT_AGENT_TOOLS,
        messages
      })
    });

    const data = await response.json();

    if (data.error) {
      if (onUpdate) {
        onUpdate(`⚠️ Flight Agent API error for ${destination}`);
      }
      return { origin, destination, found: false, options: [] };
    }

    messages.push({ role: "assistant", content: data.content });

    // ── Agent finished — extract and return JSON ──
    if (data.stop_reason === "end_turn") {
      const text = data.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      try {
        const clean   = text.replace(/```json|```/g, "").trim();
        const result  = JSON.parse(clean);

        if (result.found && result.options.length > 0) {
          const best = result.options[0];
          if (onUpdate) {
            onUpdate(
              `✅ ${destination}: €${best.price_eur}/person ` +
              `(€${best.price_total_eur} total) — ` +
              `${best.airline} — ` +
              `${Math.round(best.duration_minutes / 60 * 10) / 10}h — ` +
              `${best.stops === 0 ? "direct" : best.stops + " stop(s)"}`
            );
          }
        } else {
          if (onUpdate) {
            onUpdate(`⚠️ No flights found for ${origin} → ${destination}`);
          }
        }

        return { origin, destination, departure_date, return_date, ...result };

      } catch {
        if (onUpdate) {
          onUpdate(`⚠️ Could not parse flight results for ${destination}`);
        }
        return { origin, destination, found: false, options: [] };
      }
    }

    // ── Agent wants to use the search_flights tool ──
    if (data.stop_reason === "tool_use") {
      const toolResults = [];

      for (const block of data.content) {
        if (block.type === "tool_use" && block.name === "search_flights") {
          try {
            // Call SerpApi with the parameters Claude provided
            const serpData = await callSerpApi(block.input, serpApiKey);
            const result   = processFlightResults(
              serpData,
              block.input,
              totalPassengers
            );

            toolResults.push({
              type:        "tool_result",
              tool_use_id: block.id,
              content:     JSON.stringify(result)
            });

          } catch (err) {
            // Return error to Claude so it can decide whether to retry
            toolResults.push({
              type:        "tool_result",
              tool_use_id: block.id,
              content:     JSON.stringify({
                found:   false,
                error:   err.message,
                options: []
              })
            });
          }
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }
}


// ── Helper: formats YYYY-MM-DD to "20 Dec" ──
function formatFlightDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric", month: "short"
    });
  } catch {
    return dateStr;
  }
}