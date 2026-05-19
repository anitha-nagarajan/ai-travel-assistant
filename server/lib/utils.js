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

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function normalizeAirportCode(value) {
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

export function normalizeAirportList(airports) {
  if (!Array.isArray(airports)) return [];
  return airports.map(normalizeAirportCode).filter(Boolean);
}

export function passengerCount(value, fallback = 0) {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (Array.isArray(value)) return value.length;
  return fallback;
}

export function formatDateYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDisplayDate(dateStr) {
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

export function parseJsonArray(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* continue */
  }
  try {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {
    /* continue */
  }
  return null;
}

export function parseSearchReady(fullText) {
  const marker = "SEARCH_READY:";
  const index = fullText.indexOf(marker);
  if (index === -1) return null;
  const jsonMatch = fullText.substring(index + marker.length).trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return {
    displayText: fullText.substring(0, index).trim(),
    preferences: JSON.parse(jsonMatch[0])
  };
}

export function normalizePreferences(preferences) {
  const p = { ...preferences };
  p.departure_airports = normalizeAirportList(p.departure_airports || []);
  p.adults = passengerCount(p.adults, 1);
  p.children = passengerCount(p.children, 0);
  p.trip_min_days = Number(p.trip_min_days) || 7;
  p.trip_max_days = Math.max(p.trip_min_days, Number(p.trip_max_days) || p.trip_min_days);
  p.direct_only = Boolean(p.direct_only);
  p.max_flying_hours = Number(p.max_flying_hours) || 8;
  return p;
}

export function generateTravelWindows(travelPeriod, minDays, maxDays) {
  const windows = [];
  const min = Math.max(1, Number(minDays) || 7);
  const max = Math.max(min, Number(maxDays) || min);

  try {
    const currentYear = new Date().getFullYear();
    const parts = String(travelPeriod).toLowerCase().split(/\s+to\s+/);
    if (parts.length !== 2) return getDefaultWindows(min);

    const startDate = new Date(`${parts[0].trim()} ${currentYear}`);
    let endDate = new Date(`${parts[1].trim()} ${currentYear}`);
    if (endDate < startDate) endDate.setFullYear(currentYear + 1);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return getDefaultWindows(min);
    }

    const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));

    for (let startOffset = 0; startOffset <= totalDays - min; startOffset += 3) {
      for (let duration = min; duration <= max; duration += 3) {
        const depDate = new Date(startDate);
        depDate.setDate(depDate.getDate() + startOffset);
        const retDate = new Date(depDate);
        retDate.setDate(retDate.getDate() + duration);
        if (retDate > endDate) break;
        windows.push({
          departure_date: formatDateYMD(depDate),
          return_date: formatDateYMD(retDate),
          duration_days: duration
        });
        if (windows.length >= 3) return windows;
      }
    }
  } catch {
    return getDefaultWindows(min);
  }

  return windows.length > 0 ? windows : getDefaultWindows(min);
}

function getDefaultWindows(minDays) {
  const today = new Date();
  const dep = new Date(today);
  dep.setDate(today.getDate() + 30);
  const ret = new Date(dep);
  ret.setDate(dep.getDate() + minDays);
  return [
    {
      departure_date: formatDateYMD(dep),
      return_date: formatDateYMD(ret),
      duration_days: minDays
    }
  ];
}

/** Parse travel period into YYYY-MM-DD bounds for Open-Meteo. */
export function parseTravelDateRange(travelPeriod) {
  const windows = generateTravelWindows(travelPeriod, 7, 7);
  if (windows.length === 0) return null;
  return {
    start: windows[0].departure_date,
    end: windows[0].return_date
  };
}
