import { config } from "../config.js";
import { normalizeAirportCode, passengerCount } from "./utils.js";

export function processFlightResults(data, totalPassengers) {
  const rawFlights = data.best_flights || data.other_flights || [];
  if (rawFlights.length === 0) return { found: false, options: [] };

  const passengers = Math.max(totalPassengers, 1);

  const options = rawFlights.slice(0, 3).map((flight) => {
    const firstLeg = flight.flights[0];
    const lastLeg = flight.flights[flight.flights.length - 1];
    const totalPrice = flight.price;
    return {
      price_eur: Math.round(totalPrice / passengers),
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

export async function searchFlights(params) {
  if (!config.serpApiKey) {
    throw new Error("Server missing SERPAPI_KEY. Configure .env on the backend.");
  }

  const origin = normalizeAirportCode(params.origin);
  const destination = normalizeAirportCode(params.destination);
  const adults = passengerCount(params.adults, 1);
  const children = passengerCount(params.children, 0);
  const totalPassengers = adults + children;

  const base = {
    engine: "google_flights",
    departure_id: origin,
    arrival_id: destination,
    outbound_date: params.departure_date,
    return_date: params.return_date,
    adults: String(adults),
    children: String(children),
    currency: "EUR",
    gl: "nl",
    hl: "en",
    type: "1",
    api_key: config.serpApiKey
  };

  async function query(directOnly) {
    const qs = new URLSearchParams(base);
    if (directOnly) qs.append("stops", "0");
    const url = `https://serpapi.com/search?${qs.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`SerpApi HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.error) throw new Error(`SerpApi: ${data.error}`);
    return processFlightResults(data, totalPassengers);
  }

  let result = await query(Boolean(params.direct_only));
  if (!result.found && params.direct_only) {
    result = await query(false);
  }

  return {
    origin,
    destination,
    departure_date: params.departure_date,
    return_date: params.return_date,
    destination_city: params.destination_city,
    ...result
  };
}
