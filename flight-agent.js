// ============================================================
// FLIGHT-AGENT.JS
// Specialist agent that searches real flights via SerpApi
// ============================================================

async function callSerpApi(params, serpApiKey) {
  if (!serpApiKey) {
    throw new Error("SerpApi key is missing. Add it in the API key field above.");
  }

  const searchParams = new URLSearchParams({
    engine: "google_flights",
    departure_id: params.origin,
    arrival_id: params.destination,
    outbound_date: params.departure_date,
    return_date: params.return_date,
    adults: String(params.adults || 1),
    children: String(params.children || 0),
    currency: "EUR",
    gl: "nl",
    hl: "en",
    type: "1",
    api_key: serpApiKey
  });

  if (params.direct_only) {
    searchParams.append("stops", "0");
  }

  const url =
    "https://corsproxy.io/?" +
    encodeURIComponent(`https://serpapi.com/search?${searchParams.toString()}`);

  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(
      `SerpApi HTTP error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`SerpApi error: ${data.error}`);
  }

  return data;
}

function processFlightResults(data, totalPassengers) {
  const rawFlights = data.best_flights || data.other_flights || [];

  if (rawFlights.length === 0) {
    return { found: false, options: [] };
  }

  const passengers = Math.max(totalPassengers, 1);

  const options = rawFlights.slice(0, 3).map(flight => {
    const firstLeg = flight.flights[0];
    const lastLeg = flight.flights[flight.flights.length - 1];
    const totalPrice = flight.price;
    const pricePerPerson = Math.round(totalPrice / passengers);

    return {
      price_eur: pricePerPerson,
      price_total_eur: Math.round(totalPrice),
      airline: firstLeg.airline,
      duration_minutes: flight.total_duration,
      stops: flight.flights.length - 1,
      departure_time: firstLeg.departure_airport.time,
      arrival_time: lastLeg.arrival_airport.time
    };
  });

  return { found: true, options };
}

async function runFlightAgent(searchParams, serpApiKey, _claudeApiKey, onUpdate) {
  const origin = normalizeAirportCode(searchParams.origin);
  const destination = normalizeAirportCode(searchParams.destination);
  const adults = passengerCount(searchParams.adults, 1);
  const children = passengerCount(searchParams.children, 0);
  const directOnly = Boolean(searchParams.direct_only);
  const totalPassengers = adults + children;

  const baseParams = {
    origin,
    destination,
    departure_date: searchParams.departure_date,
    return_date: searchParams.return_date,
    adults,
    children,
    direct_only: directOnly
  };

  if (onUpdate) {
    onUpdate(
      `✈️ Flight Agent: searching ${origin} → ${destination} ` +
      `(${formatDisplayDate(baseParams.departure_date)} – ` +
      `${formatDisplayDate(baseParams.return_date)})...`
    );
  }

  let result = { found: false, options: [] };

  try {
    const serpData = await callSerpApi(baseParams, serpApiKey);
    result = processFlightResults(serpData, totalPassengers);
  } catch (err) {
    if (onUpdate) {
      onUpdate(`⚠️ Flight search error ${origin} → ${destination}: ${err.message}`);
    }
    return {
      ...baseParams,
      destination_city: searchParams.destination_city,
      found: false,
      options: [],
      error: err.message
    };
  }

  if (!result.found && directOnly) {
    if (onUpdate) {
      onUpdate(
        `✈️ Flight Agent: no direct flights for ${origin} → ${destination}, ` +
        `retrying with connections...`
      );
    }
    try {
      const retryData = await callSerpApi(
        { ...baseParams, direct_only: false },
        serpApiKey
      );
      result = processFlightResults(retryData, totalPassengers);
    } catch {
      // Keep empty result from first attempt
    }
  }

  if (result.found && result.options.length > 0) {
    const best = result.options[0];
    if (onUpdate) {
      onUpdate(
        `✅ ${destination}: €${best.price_eur}/person ` +
        `(€${best.price_total_eur} total) — ${best.airline} — ` +
        `${Math.round((best.duration_minutes / 60) * 10) / 10}h — ` +
        `${best.stops === 0 ? "direct" : best.stops + " stop(s)"}`
      );
    }
  } else if (onUpdate) {
    onUpdate(`⚠️ No flights found for ${origin} → ${destination}`);
  }

  return {
    ...baseParams,
    destination_city: searchParams.destination_city,
    ...result
  };
}
