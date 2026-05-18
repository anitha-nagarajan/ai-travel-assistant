// ============================================================
// ORCHESTRATOR.JS
// Master coordinator: requirements gathering + specialist agents
// ============================================================

const ORCHESTRATOR_PROMPT = `You are the master Travel Orchestrator Agent.
Your job has TWO phases:

═══════════════════════════════════════
PHASE 1 — REQUIREMENTS GATHERING
═══════════════════════════════════════
Collect ALL required information by asking friendly questions.
Ask maximum 2 questions at a time. Wait for answers before continuing.

Collect in this order:
1. Number of adults and children (and children's ages if any)
2. Departure airport(s) or city — use IATA codes in SEARCH_READY (e.g. AMS, LHR)
3. Holiday period (e.g. "19 December to 2 January")
4. Trip duration preference (min and max days)
5. Maximum flying time in hours
6. Direct flights only or connections OK?
7. Continent/region preference or anywhere?
8. Climate requirements (temperature, beach, mountains, etc.)
9. Any other preferences (city break, nature, culture, etc.)

Once ALL information is collected:
- Summarise requirements back to the user clearly
- Tell them you are handing off to your specialist agents
- Respond with EXACTLY this JSON on the last line (after your message):
  SEARCH_READY:{"departure_airports":["AMS"],"max_flying_hours":4,"direct_only":true,"continent_preference":"any","climate_preference":"warm min 20C","travel_period":"19 December to 2 January","trip_min_days":8,"trip_max_days":14,"adults":2,"children":0,"other_preferences":"beach"}

Rules for SEARCH_READY JSON:
- departure_airports must be IATA codes (3 letters)
- children is a number (count), not an array
- trip_min_days and trip_max_days are required numbers

═══════════════════════════════════════
PHASE 2 — RESULT DELIVERY
═══════════════════════════════════════
When you receive the final recommendation from the specialist agents,
present it to the user exactly as given — do not summarise or shorten it.
Add a warm, friendly intro before the results.`;


function generateTravelWindows(travelPeriod, minDays, maxDays) {
  const windows = [];
  const min = Math.max(1, Number(minDays) || 7);
  const max = Math.max(min, Number(maxDays) || min);

  try {
    const currentYear = new Date().getFullYear();
    const parts = travelPeriod.toLowerCase().split(/\s+to\s+/);

    if (parts.length !== 2) return getDefaultWindows(min);

    const startDate = new Date(`${parts[0].trim()} ${currentYear}`);
    let endDate = new Date(`${parts[1].trim()} ${currentYear}`);

    if (endDate < startDate) {
      endDate.setFullYear(currentYear + 1);
    }

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return getDefaultWindows(min);
    }

    const totalDays = Math.round(
      (endDate - startDate) / (1000 * 60 * 60 * 24)
    );

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

        if (windows.length >= 4) return windows;
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

  return [{
    departure_date: formatDateYMD(dep),
    return_date: formatDateYMD(ret),
    duration_days: minDays
  }];
}


function parseSearchReady(fullText) {
  const marker = "SEARCH_READY:";
  const index = fullText.indexOf(marker);
  if (index === -1) return null;

  const jsonStr = fullText.substring(index + marker.length).trim();
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  return {
    displayText: fullText.substring(0, index).trim(),
    preferences: JSON.parse(jsonMatch[0])
  };
}


function normalizePreferences(preferences) {
  preferences.departure_airports = normalizeAirportList(
    preferences.departure_airports || []
  );
  preferences.adults = passengerCount(preferences.adults, 1);
  preferences.children = passengerCount(preferences.children, 0);
  preferences.trip_min_days = Number(preferences.trip_min_days) || 7;
  preferences.trip_max_days = Math.max(
    preferences.trip_min_days,
    Number(preferences.trip_max_days) || preferences.trip_min_days
  );
  preferences.direct_only = Boolean(preferences.direct_only);
  preferences.max_flying_hours = Number(preferences.max_flying_hours) || 8;
  return preferences;
}


async function runOrchestrator(
  userMessage,
  conversationHistory,
  claudeApiKey,
  serpApiKey,
  onUpdate,
  onFinalReply
) {
  conversationHistory.push({ role: "user", content: userMessage });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      system: ORCHESTRATOR_PROMPT,
      messages: conversationHistory
    })
  });

  const data = await response.json();

  if (data.error) {
    onFinalReply("⚠️ Error: " + data.error.message);
    return;
  }

  const fullText = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  conversationHistory.push({ role: "assistant", content: data.content });

  let parsed;
  try {
    parsed = parseSearchReady(fullText);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    onFinalReply(fullText.trim());
    return;
  }

  if (parsed.displayText) {
    onFinalReply(parsed.displayText, true);
  }

  let preferences;
  try {
    preferences = normalizePreferences(parsed.preferences);
  } catch {
    onFinalReply(
      "⚠️ I had trouble reading your requirements. " +
      "Could you confirm your travel details again?"
    );
    return;
  }

  if (!preferences.departure_airports.length) {
    onFinalReply(
      "⚠️ I need at least one departure airport (IATA code, e.g. AMS). " +
      "Which city or airport will you fly from?"
    );
    return;
  }

  if (!serpApiKey) {
    onFinalReply(
      "⚠️ A SerpApi key is required for live flight search. " +
      "Please paste your SerpApi key above and send your message again."
    );
    return;
  }

  onUpdate("🚀 All requirements collected! Starting search with specialist agents...");

  try {
    await sleep(1500);

    const destinations = await runDestinationAgent(
      preferences,
      claudeApiKey,
      onUpdate
    );

    if (!destinations || destinations.length === 0) {
      onFinalReply(
        "I couldn't find destinations matching your criteria. " +
        "Could you try with different preferences?"
      );
      return;
    }

    const windows = generateTravelWindows(
      preferences.travel_period,
      preferences.trip_min_days,
      preferences.trip_max_days
    );

    onUpdate(
      `📅 Checking ${windows.length} travel windows across ` +
      `${destinations.length} destinations...`
    );

    const flightResults = [];
    const origin = preferences.departure_airports[0];

    for (const destination of destinations.slice(0, 3)) {
      const destCode = normalizeAirportCode(destination.airport_code);

      for (const window of windows) {
        await sleep(2500);

        const result = await runFlightAgent(
          {
            origin,
            destination: destCode,
            destination_city: destination.city,
            departure_date: window.departure_date,
            return_date: window.return_date,
            adults: preferences.adults,
            children: preferences.children,
            direct_only: preferences.direct_only
          },
          serpApiKey,
          claudeApiKey,
          onUpdate
        );

        if (result.found) {
          flightResults.push(result);
        }
      }
    }

    const weatherResults = [];
    const seenCities = new Set();

    for (const result of flightResults) {
      const cityKey = (result.destination_city || result.destination).toLowerCase();
      if (seenCities.has(cityKey)) continue;
      seenCities.add(cityKey);

      await sleep(2000);

      const weather = await runWeatherAgent(
        result.destination_city || result.destination,
        preferences.travel_period,
        claudeApiKey,
        onUpdate
      );

      weather.airport_code = result.destination;
      weatherResults.push(weather);
    }

    await sleep(1500);

    const recommendation = await runRecommendationAgent(
      flightResults,
      weatherResults,
      preferences,
      claudeApiKey,
      onUpdate
    );

    onFinalReply(recommendation);
  } catch (error) {
    console.error("Orchestrator error:", error);
    onFinalReply(
      "⚠️ Something went wrong during the search: " + error.message +
      "\n\nPlease check your API keys and try again."
    );
  }
}
