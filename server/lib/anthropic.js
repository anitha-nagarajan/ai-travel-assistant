import { config } from "../config.js";
import { sleep } from "./utils.js";

let lastHaikuCallAt = 0;

function isRateLimitError(message) {
  return /rate limit|rate_limit|too many requests|429/i.test(message || "");
}

export function extractText(data) {
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function throttleHaiku() {
  const elapsed = Date.now() - lastHaikuCallAt;
  if (elapsed < config.haikuGapMs) {
    await sleep(config.haikuGapMs - elapsed);
  }
  lastHaikuCallAt = Date.now();
}

export async function callClaude(body, { onRetry } = {}) {
  if (!config.anthropicApiKey) {
    throw new Error("Server missing ANTHROPIC_API_KEY. Configure .env on the backend.");
  }

  const isHaiku = String(body.model || "").includes("haiku");
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (isHaiku) await throttleHaiku();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.error) {
      const msg = data.error.message || "Anthropic API error";
      if (isRateLimitError(msg) && attempt < maxRetries - 1) {
        const retryAfter = parseInt(response.headers.get("retry-after") || "65", 10);
        const waitMs = Math.max(retryAfter, 65) * 1000;
        if (onRetry) onRetry(waitMs);
        await sleep(waitMs);
        lastHaikuCallAt = Date.now();
        continue;
      }
      throw new Error(msg);
    }

    return data;
  }

  throw new Error("Anthropic API failed after retries.");
}
