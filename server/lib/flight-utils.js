import { normalizeAirportCode } from "./utils.js";

/**
 * True when the itinerary has no connections (nonstop each way on round trips).
 * SerpApi round-trip direct = exactly 2 segments: origin→dest, dest→origin.
 */
export function isDirectItinerary(flight, origin, destination) {
  const legs = flight.flights || [];
  if (legs.length === 0) return false;

  const o = normalizeAirportCode(origin);
  const d = normalizeAirportCode(destination);
  const firstDep = normalizeAirportCode(legs[0].departure_airport?.id);
  const lastArr = normalizeAirportCode(
    legs[legs.length - 1].arrival_airport?.id
  );

  // Round trip
  if (firstDep === o && lastArr === o) {
    if (legs.length !== 2) return false;
    return (
      normalizeAirportCode(legs[0].arrival_airport?.id) === d &&
      normalizeAirportCode(legs[1].departure_airport?.id) === d
    );
  }

  // One way
  if (legs.length === 1) {
    return (
      firstDep === o &&
      normalizeAirportCode(legs[0].arrival_airport?.id) === d
    );
  }

  return false;
}

export function countConnectionStops(flight, origin, destination) {
  if (isDirectItinerary(flight, origin, destination)) return 0;
  const legs = flight.flights || [];
  const o = normalizeAirportCode(origin);
  const firstDep = normalizeAirportCode(legs[0]?.departure_airport?.id);
  const lastArr = normalizeAirportCode(
    legs[legs.length - 1]?.arrival_airport?.id
  );

  if (firstDep === o && lastArr === o) {
    return Math.max(0, legs.length - 2);
  }
  return Math.max(0, legs.length - 1);
}
