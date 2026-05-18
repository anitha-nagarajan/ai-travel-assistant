// ============================================================
// SHARED.JS — helpers used across agents
// ============================================================

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-20250514";

/** Minimum pause between Haiku API calls (helps avoid TPM bursts). */
const HAIKU_CALL_GAP_MS = 12000;

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

let lastHaikuCallAt = 0;

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

function isRateLimitError(message) {
  if (!message) return false;
  return /rate limit|rate_limit|too many requests|429/i.test(message);
}

function extractTextFromResponse(data) {
  return (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");
}

function parseJsonArray(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // continue
  }
  try {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {
    // continue
  }
  return null;
}

function parseJsonObject(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // continue
  }
  try {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {
    // continue
  }
  return null;
}

async function throttleHaikuCalls() {
  const elapsed = Date.now() - lastHaikuCallAt;
  if (elapsed < HAIKU_CALL_GAP_MS) {
    await sleep(HAIKU_CALL_GAP_MS - elapsed);
  }
  lastHaikuCallAt = Date.now();
}

/**
 * Call Anthropic Messages API with retries on rate limits.
 */
async function callClaude(body, apiKey, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const useHaikuThrottle = options.throttleHaiku !== false &&
    String(body.model || "").includes("haiku");

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (useHaikuThrottle) {
      await throttleHaikuCalls();
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.error) {
      const msg = data.error.message || "Unknown API error";
      if (isRateLimitError(msg) && attempt < maxRetries - 1) {
        const retryAfterSec = parseInt(
          response.headers.get("retry-after") || "65",
          10
        );
        const waitMs = Math.max(retryAfterSec, 65) * 1000;
        if (options.onUpdate) {
          options.onUpdate(
            `⏳ API rate limit reached — waiting ${Math.round(waitMs / 1000)}s before retry...`
          );
        }
        await sleep(waitMs);
        lastHaikuCallAt = Date.now();
        continue;
      }
      throw new Error(msg);
    }

    return data;
  }

  throw new Error("API request failed after retries.");
}
