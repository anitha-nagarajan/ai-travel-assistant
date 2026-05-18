// ============================================================
// ORCHESTRATOR.JS
// The master coordinator that collects requirements from the
// user and delegates tasks to each specialist agent in order
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
2. Departure airport(s) or city
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
  SEARCH_READY:{"departure_airports":["AMS"],"max_flying_hours":4,"direct_only":true,"continent_preference":"any","climate_preference":"warm min 20C","travel_period":"19 Dec to 2 Jan","trip_min_days":8,"trip_max_days":14,"adults":2,"children":2,"other_preferences":"beach"}

═══════════════════════════════════════
PHASE 2 — RESULT DELIVERY
═══════════════════════════════════════
When you receive the final recommendation from the specialist agents,
present it to the user exactly as given — do not summarise or shorten it.
Add a warm, friendly intro before the results.`;


// ── Generate travel windows from holiday period and duration ──
function generateTravelWindows(travelPeriod, minDays, maxDays) {
  // Parse start and end dates from travel period string
  // Expected format: "19 Dec to 2 Jan" or "19 December to 2 January"
  const windows = [];

  try {
    const currentYear = new Date().getFullYear();

    // Split on "to" to get start and end
    const parts = travelPeriod.toLowerCase().split(" to ");
    if (parts.length !== 2) return getDefaultWindows();

    const startDate = new Date(`${parts[0]} ${currentYear}`);
    const endDate   = new Date(`${parts[1]} ${currentYear}`);

    // Handle year wrap (e.g. Dec to Jan)
    if (endDate < startDate) {
      endDate.setFullYear(currentYear + 1);
    }

    if (isNaN(startDate) || isNaN(endDate)) return getDefaultWindows();

    const totalDays = Math.round(
      (endDate - startDate) / (1000 * 60 * 60 * 24)
    );

    // Generate windows — sample every 3 days to avoid too many searches
    for (let startOffset = 0; startOffset <= totalDays - minDays; startOffset += 3) {
      for (let duration = minDays; duration <= maxDays; duration += 3) {
        const depDate = new Date(startDate);
        depDate.setDate(depDate.getDate() + startOffset);

        const retDate = new Date(depDate);
        retDate.setDate(retDate.getDate() + duration);

        if (retDate > endDate) break;

        windows.push({
          departure_date: formatDateYMD(depDate),
          return_date:    formatDateYMD(retDate),
          duration_days:  duration
        });

        // Cap at 6 windows to control API usage
        if (windows.length >= 6) return windows;
      }
    }

  } catch {
    return getDefaultWindows();
  }

  return windows.length > 0 ? windows : getDefaultWindows();
}


// ── Fallback windows if parsing fails ──
function getDefaultWindows() {
  const today = new Date();
  const dep1  = new Date(today);
  dep1.setDate(today.getDate() + 30);
  const ret1 = new Date(dep1);
  ret1.setDate(dep1.getDate() + 7);

  return [{
    departure_date: formatDateYMD(dep1),
    return_date:    formatDateYMD(ret1),
    duration_days:  7
  }];
}


// ── Format date as YYYY-MM-DD ──
function formatDateYMD(date) {
  return date.toISOString().split("T")[0];
}


// ── Sleep helper ──
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ══════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR FUNCTION
// ══════════════════════════════════════════════════════════════
async function runOrchestrator(
  userMessage,
  conversationHistory,
  claudeApiKey,
  serpApiKey,
  onUpdate,
  onFinalReply
) {
  // Add user message to history
  conversationHistory.push({ role: "user", content: userMessage });

  // ── Phase 1: Requirements gathering loop ──
  // Keep chatting until we get SEARCH_READY signal
  while (true) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model:    "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system:   ORCHESTRATOR_PROMPT,
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

    // ── Check if requirements are complete ──
    const searchReadyIndex = fullText.indexOf("SEARCH_READY:");

    if (searchReadyIndex === -1) {
      // Still gathering requirements — show message to user and wait
      const displayText = fullText.trim();
      onFinalReply(displayText);
      return; // Wait for user's next message
    }

    // ── Requirements complete — extract preferences ──
    const displayText = fullText.substring(0, searchReadyIndex).trim();
    if (displayText) {
      onFinalReply(displayText, true); // Show summary to user
    }

    let preferences;
    try {
      const jsonStr = fullText.substring(
        searchReadyIndex + "SEARCH_READY:".length
      ).trim();
      preferences = JSON.parse(jsonStr);
    } catch {
      onFinalReply(
        "⚠️ I had trouble reading your requirements. " +
        "Could you confirm your travel details again?"
      );
      return;
    }

    // ── Phase 2: Search begins ──
    onUpdate("🚀 All requirements collected! Starting search with specialist agents...");

    try {
      // ── Step 1: Find matching destinations ──
      await sleep(2000);
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

      // ── Step 2: Generate travel windows ──
      const windows = generateTravelWindows(
        preferences.travel_period,
        preferences.trip_min_days || 7,
        preferences.trip_max_days || 10
      );

      onUpdate(
        `📅 Generated ${windows.length} travel windows to check ` +
        `across ${destinations.length} destinations...`
      );

      // ── Step 3: Search flights for each destination × window ──
      const flightResults = [];

      for (const destination of destinations) {
        for (const window of windows) {
          await sleep(3000); // Rate limit protection

          const result = await runFlightAgent(
            {
              origin:         preferences.departure_airports[0],
              destination:    destination.airport_code,
              departure_date: window.departure_date,
              return_date:    window.return_date,
              adults:         preferences.adults || 1,
              children:       preferences.children || 0,
              direct_only:    preferences.direct_only || false
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

      // ── Step 4: Get weather for destinations with flights ──
      const weatherResults = [];
      const destinationsWithFlights = [
        ...new Set(flightResults.map(r => r.destination))
      ];

      for (const destCode of destinationsWithFlights) {
        await sleep(2000);

        const destInfo = destinations.find(
          d => d.airport_code === destCode
        );
        const destName = destInfo ? destInfo.city : destCode;

        const weather = await runWeatherAgent(
          destName,
          preferences.travel_period,
          claudeApiKey,
          onUpdate
        );

        weatherResults.push(weather);
      }

      // ── Step 5: Get final recommendation ──
      await sleep(2000);

      const recommendation = await runRecommendationAgent(
        flightResults,
        weatherResults,
        preferences,
        claudeApiKey,
        onUpdate
      );

      // ── Show final recommendation to user ──
      onFinalReply(recommendation);

    } catch (error) {
      console.error("Orchestrator error:", error);
      onFinalReply(
        "⚠️ Something went wrong during the search: " + error.message +
        "\n\nPlease try again."
      );
    }

    return; // Search complete
  }
}