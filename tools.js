// ============================================================
// TOOLS.JS — Tool definitions + implementations for the agent
// ============================================================

// ----------------------------------------------------------
// PART 1: Tool definitions (tells Claude what tools exist
// and what parameters each tool needs)
// ----------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: "narrow_destinations",
    description: `Based on travel preferences, generate a shortlist of 4-6 destination 
    cities worldwide that match the criteria. Consider flying time from the departure 
    airport, whether direct flights exist, continent preference, climate during the 
    travel period, and any other preferences.`,
    input_schema: {
      type: "object",
      properties: {
        departure_airports: {
          type: "array",
          items: { type: "string" },
          description: "List of departure airport codes or city names"
        },
        max_flying_hours: {
          type: "number",
          description: "Maximum acceptable flying time in hours"
        },
        direct_only: {
          type: "boolean",
          description: "Whether only direct flights are acceptable"
        },
        continent_preference: {
          type: "string",
          description: "Preferred continent/region, or 'any' for no preference"
        },
        climate_preference: {
          type: "string",
          description: "Climate preference e.g. 'warm', 'min 20 degrees', 'beach'"
        },
        travel_period: {
          type: "string",
          description: "The travel period e.g. '19 December to 2 January'"
        },
        other_preferences: {
          type: "string",
          description: "Any other destination preferences e.g. 'beach', 'city break'"
        }
      },
      required: [
        "departure_airports",
        "max_flying_hours",
        "direct_only",
        "travel_period"
      ]
    }
  },

  {
    name: "search_flights",
    description: `Search for real-time flight prices between an origin and destination 
    for specific dates and number of passengers. Returns cheapest available options.`,
    input_schema: {
      type: "object",
      properties: {
        origin: {
          type: "string",
          description: "Departure airport code or city name"
        },
        destination: {
          type: "string",
          description: "Destination airport code or city name"
        },
        departure_date: {
          type: "string",
          description: "Outbound flight date in YYYY-MM-DD format"
        },
        return_date: {
          type: "string",
          description: "Return flight date in YYYY-MM-DD format"
        },
        adults: {
          type: "integer",
          description: "Number of adult passengers"
        },
        children: {
          type: "integer",
          description: "Number of child passengers (0 if none)"
        },
        cabin_class: {
          type: "string",
          description: "Cabin class: economy, business, or first"
        },
        direct_only: {
          type: "boolean",
          description: "Whether to search only direct flights"
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
  },

  {
    name: "get_weather",
    description: `Get expected weather conditions and average temperature for a 
    destination during a specific travel period.`,
    input_schema: {
      type: "object",
      properties: {
        destination: {
          type: "string",
          description: "City or country name"
        },
        travel_period: {
          type: "string",
          description: "Travel dates e.g. '19–27 December'"
        }
      },
      required: ["destination", "travel_period"]
    }
  },

/**  
  {
    name: "calculate_budget",
    description: `Calculate the estimated total trip cost based on flight prices 
    and estimated accommodation costs for the group.`,
    input_schema: {
      type: "object",
      properties: {
        flight_price_per_adult: {
          type: "number",
          description: "Round trip flight price per adult in EUR"
        },
        flight_price_per_child: {
          type: "number",
          description: "Round trip flight price per child in EUR (0 if no children)"
        },
        adults: {
          type: "integer",
          description: "Number of adult passengers"
        },
        children: {
          type: "integer",
          description: "Number of child passengers"
        },
        num_nights: {
          type: "integer",
          description: "Number of nights at the destination"
        },
        destination: {
          type: "string",
          description: "Destination city for hotel cost estimation"
        },
        accommodation_type: {
          type: "string",
          description: "Accommodation type: budget, mid-range, or luxury"
        }
      },
      required: [
        "flight_price_per_adult",
        "adults",
        "num_nights",
        "destination"
      ]
    }
  }*/
];


// ----------------------------------------------------------
// PART 2: Tool implementations (what actually runs when
// the agent calls each tool)
// ----------------------------------------------------------

// Master function — routes each tool call to the right function
async function executeTool(toolName, toolInput, apiKey) {
  switch (toolName) {
    case "narrow_destinations":
      return await narrowDestinations(toolInput, apiKey);
    case "search_flights":
      return await searchFlights(toolInput, apiKey);
    case "get_weather":
      return await getWeather(toolInput, apiKey);
    case "calculate_budget":
      return calculateBudget(toolInput);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// Tool 1: Find matching destinations using web search
async function narrowDestinations(input, apiKey) {
  const query = `Best holiday destinations reachable from 
  ${input.departure_airports.join(" or ")} with maximum ${input.max_flying_hours} 
  hours flying time, ${input.direct_only ? "direct flights only" : "connections OK"}, 
  ${input.continent_preference && input.continent_preference !== "any"
    ? "in " + input.continent_preference
    : "anywhere in the world"}, 
  climate: ${input.climate_preference || "pleasant"}, 
  during ${input.travel_period}. 
  ${input.other_preferences || ""}
  List 3 specific city destinations with airport codes.`;

  return await searchViaClaudeAPI(
    query,
    apiKey,
    `You are a travel geography expert. Based on the search results, return a 
    JSON array of exactly 5 destination objects. Each object must have these fields:
    city (string), country (string), airport_code (string), 
    avg_temp_celsius (number), flying_hours (number), has_direct_flights (boolean).
    Return ONLY a valid JSON array. No explanation, no markdown, no extra text.`
  );
}

// Tool 2: Search real-time flight prices using web search
async function searchFlights(input, apiKey) {
  const query = `Cheapest return flights from ${input.origin} to ${input.destination}, 
  departing ${input.departure_date}, returning ${input.return_date}, 
  ${input.adults} adult${input.adults > 1 ? "s" : ""}
  ${input.children ? "and " + input.children + " children" : ""}, 
  ${input.cabin_class || "economy class"}, 
  ${input.direct_only ? "direct flights only" : "any stops"}.
  Current prices on Skyscanner or Google Flights.`;

  return await searchViaClaudeAPI(
    query,
    apiKey,
    `You are a flight price analyst. Based on the search results, return a JSON 
    object with these fields:
    cheapest_price_per_adult (number, in EUR),
    airline (string),
    duration_hours (number),
    stops (number, 0 for direct),
    booking_url (string, use "https://www.skyscanner.com" if not found).
    Return ONLY valid JSON. No explanation, no markdown, no extra text.`
  );
}

// Tool 3: Get weather for a destination during travel dates
async function getWeather(input, apiKey) {
  const query = `Average temperature and weather conditions in ${input.destination} 
  during ${input.travel_period}. Is it a good time to visit as a tourist?`;

  return await searchViaClaudeAPI(
    query,
    apiKey,
    `You are a weather expert. Based on the search results, return a JSON object 
    with these fields:
    avg_temp_celsius (number),
    weather_description (string, max 8 words),
    is_suitable (boolean),
    suitability_note (string, max 12 words).
    Return ONLY valid JSON. No explanation, no markdown, no extra text.`
  );
}

// Tool 4: Calculate total budget (no web search needed — pure calculation)
/**
 function calculateBudget(input) {
  // Estimated hotel costs per night (rough mid-range global estimates in EUR)
  const hotelRates = {
    budget: 55,
    "mid-range": 110,
    luxury: 260
  };

  const nightlyRate = hotelRates[input.accommodation_type || "mid-range"];
  const numChildren = input.children || 0;

  // Children's flights default to 75% of adult price if not specified
  const childFlightPrice =
    input.flight_price_per_child || input.flight_price_per_adult * 0.75;

  const flightTotal =
    input.flight_price_per_adult * input.adults +
    childFlightPrice * numChildren;

  const hotelTotal = nightlyRate * input.num_nights;
  const totalCost = flightTotal + hotelTotal;
  const totalPassengers = input.adults + numChildren;

  return {
    flight_total_eur: Math.round(flightTotal),
    hotel_total_eur: Math.round(hotelTotal),
    hotel_per_night_eur: nightlyRate,
    grand_total_eur: Math.round(totalCost),
    cost_per_person_eur: Math.round(totalCost / totalPassengers),
    num_nights: input.num_nights,
    total_passengers: totalPassengers
  };
}
*/

// ----------------------------------------------------------
// PART 3: Shared helper — calls Claude API with web search
// to power the search_flights, get_weather and
// narrow_destinations tools
// ----------------------------------------------------------

async function searchViaClaudeAPI(query, apiKey, systemPrompt) {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: query }]
      })
    });

    const data = await response.json();

    // Extract text from response blocks
    const text = data.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("");

    // Parse the JSON response (strip any accidental markdown formatting)
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    } catch {
      // If JSON parsing fails, return the raw text
      return { raw: text };
    }
  } catch (error) {
    return { error: error.message };
  }
}