// ============================================================
// AGENT.JS — The agent loop that orchestrates everything
// ============================================================


// ----------------------------------------------------------
// PART 1: System prompt — gives the agent its personality,
// instructions and the exact questions it must ask
// ----------------------------------------------------------

const AGENT_SYSTEM_PROMPT = `You are an expert AI Travel Agent. Your goal is to 
help users find the best possible travel options by gathering their requirements, 
searching flights across multiple destinations and time windows, and recommending 
the best options with full reasoning.

═══════════════════════════════════════
PHASE 1 — REQUIREMENTS GATHERING
═══════════════════════════════════════
When the conversation starts, collect ALL of the following information by asking 
questions in a friendly, conversational way. Ask maximum 2 questions at a time. 
Wait for the user's answer before asking the next ones.

Required information to collect:
1. Number of adults and children (if children, ask their ages)
2. Departure airport(s) or city/cities they can fly from
3. Full holiday period (e.g. "19 December to 2 January")
4. Preferred trip duration — minimum and maximum number of days
5. Maximum flying time they are comfortable with (in hours)
6. Direct flights only, or are connections acceptable?
7. Any continent or region preference, or open to anywhere?
8. Climate or temperature requirements (e.g. minimum temperature, beach, mountains)
9. Any other destination preferences (city break, nature, culture, etc.)

Once ALL information is collected, do the following:
- Summarise the requirements back to the user clearly
- Tell them you are now starting the search
- Then immediately call the narrow_destinations tool

═══════════════════════════════════════
PHASE 2 — SEARCHING
═══════════════════════════════════════
Follow this exact sequence:

STEP 1 — Call narrow_destinations with all collected preferences.
          This returns 4-6 candidate destinations.

STEP 2 — For each destination returned, generate travel windows.
          A travel window = one valid outbound + return date pair.
          Rules for generating windows:
          - Stay within the user's holiday period
          - Duration must be between user's min and max days
          - Generate 3-4 windows per destination
            (e.g. earliest possible, middle of period, latest possible, 
            plus one more if duration range allows)

STEP 3 — For each destination × window combination:
          a) Call search_flights
          b) Call get_weather  

STEP 4 — After ALL combinations are searched, move to Phase 3.

═══════════════════════════════════════
PHASE 3 — RECOMMENDATION
═══════════════════════════════════════
Rank all searched options and present the TOP 3 as follows:

For each option show:
⭐ Rank + Destination name + Dates
✈️ Flight: airline, price per person, total flight cost, duration, stops
🌡️ Weather: average temperature + short description  
💰 Total cost: flights + estimated accommodation for the group
📝 Why this option: 2-3 sentences explaining why it ranks here
🔗 Book here: Skyscanner or Google Flights link

End with a short paragraph comparing the 3 options and giving a clear 
overall recommendation.

═══════════════════════════════════════
IMPORTANT RULES
═══════════════════════════════════════
- Always be warm, friendly and encouraging
- Never ask all questions at once — maximum 2 per message
- Never skip the requirements phase and go straight to searching
- Always call calculate_budget after each search_flights result
- If a search returns an error, skip that window and continue
- Do not make up flight prices — only use data from search_flights tool`;


// ----------------------------------------------------------
// PART 2: The agent loop
// This function sends messages to Claude, handles tool calls,
// and keeps looping until Claude gives a final text answer
// ----------------------------------------------------------

async function runAgent(userMessage, conversationHistory, apiKey, onUpdate, onFinalReply) {

  // Add the user's latest message to the conversation
  conversationHistory.push({ role: "user", content: userMessage });

  // Keep looping until the agent finishes (stop_reason === "end_turn")
  while (true) {

    // Call the Claude API with our tool definitions
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
     body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: AGENT_SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages: conversationHistory
      })
    });

    const data = await response.json();

    // Handle API errors
    if (data.error) {
      onFinalReply("⚠️ API Error: " + data.error.message);
      break;
    }

    // Save the assistant's full response to conversation history
    // (important: must include tool_use blocks for the loop to work)
    conversationHistory.push({ role: "assistant", content: data.content });

    // ── Case 1: Agent is done — give the final answer ──
    if (data.stop_reason === "end_turn") {
      const finalText = data.content
        .filter(block => block.type === "text")
        .map(block => block.text)
        .join("");
      onFinalReply(finalText);
      break;
    }

    // ── Case 2: Agent wants to use tools ──
    if (data.stop_reason === "tool_use") {

      // If the agent wrote any text before calling tools, show it
      const textBeforeTools = data.content
        .filter(block => block.type === "text")
        .map(block => block.text)
        .join("");
      if (textBeforeTools.trim()) {
        onFinalReply(textBeforeTools, true); // true = intermediate message
      }

      // Collect all tool calls in this response
      const toolUseBlocks = data.content.filter(
        block => block.type === "tool_use"
      );

      // Helper: pauses execution for a given number of milliseconds
      // Used to avoid hitting API rate limits between tool calls
      function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
      // Execute each tool and collect results
      const toolResults = [];

      for (const toolCall of toolUseBlocks) {

        // Send a live update to the UI before running the tool
        onUpdate(toolCall.name, toolCall.input);

        // Wait 4 seconds between tool calls to stay within rate limits
        await sleep(8000);

        // Run the tool (defined in tools.js)
        const result = await executeTool(toolCall.name, toolCall.input, apiKey);

        // Send a completion update to the UI after the tool finishes
        onUpdate(toolCall.name, toolCall.input, result);

        // Package the result to send back to Claude
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }

      // Add all tool results to the conversation
      // so Claude can see what each tool returned
      conversationHistory.push({ role: "user", content: toolResults });

      // Loop continues — Claude will now read the results
      // and decide what to do next (more tools or final answer)
    }
  }
}


// ----------------------------------------------------------
// PART 3: Live update message builder
// Formats the progress messages shown in the chat UI
// during the search loop
// ----------------------------------------------------------

function buildUpdateMessage(toolName, input, result) {

  // BEFORE result — tool is starting (result is undefined)
  if (!result) {
    switch (toolName) {
      case "narrow_destinations":
        return `🔍 Finding best destinations matching your preferences...`;

      case "search_flights":
        return `✈️ Searching flights: ${input.origin} → ${input.destination} ` +
               `(${formatDate(input.departure_date)} – ${formatDate(input.return_date)})...`;

      case "get_weather":
        return `🌤️ Checking weather in ${input.destination} during your travel dates...`;

      case "calculate_budget":
        return `💰 Calculating total budget for ${input.destination}...`;

      default:
        return `🔧 Running ${toolName}...`;
    }
  }

  // AFTER result — tool finished, show a summary
  if (result.error) {
    return `⚠️ Could not get data for ${input.destination || toolName} — skipping.`;
  }

  switch (toolName) {
    case "narrow_destinations":
      if (Array.isArray(result)) {
        const names = result.map(d => d.city).join(", ");
        return `✅ Found ${result.length} matching destinations: ${names}`;
      }
      return `✅ Destinations identified.`;

    case "search_flights":
      if (result.cheapest_price_per_adult) {
        return `✅ ${input.destination} (${formatDate(input.departure_date)} – ` +
               `${formatDate(input.return_date)}): ` +
               `€${result.cheapest_price_per_adult}/person — ${result.airline}`;
      }
      return `✅ Flights searched for ${input.destination}.`;

    case "get_weather":
      if (result.avg_temp_celsius) {
        return `✅ ${input.destination}: ${result.avg_temp_celsius}°C — ` +
               `${result.weather_description}`;
      }
      return `✅ Weather checked for ${input.destination}.`;

    case "calculate_budget":
      if (result.grand_total_eur) {
        return `✅ Total trip cost: €${result.grand_total_eur} ` +
               `(€${result.cost_per_person_eur}/person)`;
      }
      return `✅ Budget calculated.`;

    default:
      return `✅ ${toolName} completed.`;
  }
}


// ----------------------------------------------------------
// PART 4: Small helper — formats YYYY-MM-DD dates to
// readable format e.g. "19 Dec"
// ----------------------------------------------------------

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}