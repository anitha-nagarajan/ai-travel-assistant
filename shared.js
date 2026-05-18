// ============================================================
// SHARED.JS — helpers used across agents
// ============================================================

const CITY_TO_IATA = {
  amsterdam: "AMS",
  rotterdam: "RTM",
  eindhoven: "EIN",
  brussels: "BRU",
  paris: "CDG",
  london: "LHR",
  berlin: "BER",
  frankfurt: "FRA",
  munich: "MUC",
  rome: "FCO",
  madrid: "MAD",
  barcelona: "BCN",
  lisbon: "LIS",
  dublin: "DUB",
  vienna: "VIE",
  zurich: "ZRH",
  copenhagen: "CPH",
  stockholm: "ARN",
  oslo: "OSL",
  helsinki: "HEL",
  athens: "ATH",
  istanbul: "IST",
  dubai: "DXB",
  "new york": "JFK",
  "new york city": "JFK"
};

function normalizeAirportCode(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;

  const key = trimmed.toLowerCase();
  if (CITY_TO_IATA[key]) return CITY_TO_IATA[key];

  const paren = trimmed.match(/\(([A-Z]{3})\)/i);
  if (paren) return paren[1].toUpperCase();

  return upper.slice(0, 3);
}

function normalizeAirportList(airports) {
  if (!Array.isArray(airports)) return [];
  return airports.map(normalizeAirportCode).filter(Boolean);
}

function passengerCount(value, fallback = 0) {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (Array.isArray(value)) return value.length;
  return fallback;
}

function formatDateYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short"
    });
  } catch {
    return dateStr;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
