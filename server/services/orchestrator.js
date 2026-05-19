import { config } from "../config.js";
import { callClaude, extractText } from "../lib/anthropic.js";
import { normalizePreferences, parseSearchReady } from "../lib/utils.js";

const ORCHESTRATOR_PROMPT = `You are the master Travel Orchestrator Agent.
Collect ALL trip requirements through friendly conversation (max 2 questions per message).

Required: adults/children, departure airport IATA codes, holiday period, trip min/max days,
max flying hours, direct vs connections, region, climate, other preferences.

When complete, summarise and end with exactly:
SEARCH_READY:{"departure_airports":["AMS"],"max_flying_hours":4,"direct_only":true,"continent_preference":"any","climate_preference":"warm","travel_period":"19 December to 2 January","trip_min_days":8,"trip_max_days":14,"adults":2,"children":0,"other_preferences":"beach"}

SEARCH_READY rules: IATA codes, children is a number, include trip_min_days and trip_max_days.`;

export async function handleChatMessage(message, conversationHistory = []) {
  const history = [...conversationHistory, { role: "user", content: message }];

  const data = await callClaude({
    model: config.sonnetModel,
    max_tokens: 1200,
    system: ORCHESTRATOR_PROMPT,
    messages: history
  });

  const fullText = extractText(data);
  const assistantContent = data.content;
  const updatedHistory = [...history, { role: "assistant", content: assistantContent }];

  let parsed = null;
  try {
    parsed = parseSearchReady(fullText);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return {
      reply: fullText.trim(),
      conversationHistory: updatedHistory,
      searchReady: false
    };
  }

  let preferences = null;
  try {
    preferences = normalizePreferences(parsed.preferences);
  } catch {
    return {
      reply:
        parsed.displayText ||
        "I had trouble saving your requirements. Could you confirm your travel details again?",
      conversationHistory: updatedHistory,
      searchReady: false
    };
  }

  return {
    reply: parsed.displayText || "Starting your search now!",
    conversationHistory: updatedHistory,
    searchReady: true,
    preferences
  };
}
