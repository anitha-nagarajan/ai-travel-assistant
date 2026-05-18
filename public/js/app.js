let conversationHistory = [];
let isRunning = false;
let thinkingId = null;

window.addEventListener("DOMContentLoaded", () => {
  checkBackendHealth();
  setAgentActive("orchestrator");
  addMessage(
    "assistant",
    "👋 Welcome to AI Travel Assistant v4!\n\n" +
      "Your API keys stay on the server — nothing sensitive in the browser.\n\n" +
      "🎯 Orchestrator — gathers your trip requirements\n" +
      "🌍 Destinations — Claude shortlist (cached on server)\n" +
      "✈️ Flights — live SerpApi / Google Flights\n" +
      "🌤️ Weather — Open-Meteo (free, no LLM)\n" +
      "⭐ Recommendation — final ranked picks\n\n" +
      "Tell me you'd like to plan a trip to get started! ✈️"
  );

  document.getElementById("send-btn").addEventListener("click", sendMessage);
  document.getElementById("user-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
});

async function checkBackendHealth() {
  const bar = document.getElementById("backend-status");
  const label = document.getElementById("backend-label");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.ok) {
      bar.classList.remove("offline");
      const keys = [];
      if (!data.anthropic) keys.push("Anthropic");
      if (!data.serpapi) keys.push("SerpApi");
      label.textContent =
        keys.length > 0
          ? `Backend online — configure server .env (${keys.join(", ")})`
          : "Backend online — ready";
    } else {
      throw new Error("unhealthy");
    }
  } catch {
    bar.classList.add("offline");
    label.textContent =
      "Backend offline — run npm start and open http://localhost:3000";
  }
}

async function sendMessage() {
  const input = document.getElementById("user-input");
  const text = input.value.trim();
  if (!text || isRunning) return;

  isRunning = true;
  setInputEnabled(false);
  input.value = "";
  addMessage("user", text);
  setThinking("💭 Orchestrator is thinking...");
  setAgentActive("orchestrator");

  try {
    const chatRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, conversationHistory })
    });

    const chatData = await chatRes.json();
    if (!chatRes.ok) throw new Error(chatData.error || "Chat request failed");

    conversationHistory = chatData.conversationHistory || conversationHistory;
    removeThinking();

    if (chatData.reply) addMessage("assistant", chatData.reply);

    if (chatData.searchReady && chatData.preferences) {
      setThinking("🔍 Specialist agents searching...");
      await runSearchStream(chatData.preferences);
    }
  } catch (err) {
    removeThinking();
    addMessage("assistant", "⚠️ " + err.message);
  }

  setAgentDone("recommendation");
  isRunning = false;
  setInputEnabled(true);
  setAgentActive("orchestrator");
}

async function runSearchStream(preferences) {
  const response = await fetch("/api/search/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Search failed to start");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        handleSearchEvent(JSON.parse(line.slice(6)));
      } catch {
        /* skip malformed */
      }
    }
  }
}

function handleSearchEvent(event) {
  if (event.type === "progress") {
    removeThinking();
    if (event.agent) setAgentActive(event.agent);
    if (event.message) {
      const level =
        event.level === "done" ? "done" : event.level === "warn" ? "warn" : "";
      addLiveUpdate(event.message, level);
      if (level !== "done" && level !== "warn") setThinking("⏳ Working...");
    }
  }

  if (event.type === "complete" && event.recommendation) {
    removeThinking();
    addMessage("assistant", event.recommendation);
  }

  if (event.type === "error") {
    removeThinking();
    addMessage("assistant", "⚠️ " + event.message);
  }
}

function addMessage(role, text) {
  const box = document.getElementById("chat-box");
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.textContent = text;
  box.appendChild(el);
  scrollToBottom();
}

function addLiveUpdate(text, modifier) {
  const box = document.getElementById("chat-box");
  const div = document.createElement("div");
  div.className = "live-update" + (modifier ? ` ${modifier}` : "");
  div.textContent = text;
  box.appendChild(div);
  scrollToBottom();
}

function setThinking(text) {
  removeThinking();
  const box = document.getElementById("chat-box");
  thinkingId = "thinking-" + Date.now();
  const el = document.createElement("div");
  el.id = thinkingId;
  el.className = "message thinking";
  el.textContent = text;
  box.appendChild(el);
  scrollToBottom();
}

function removeThinking() {
  if (thinkingId) {
    document.getElementById(thinkingId)?.remove();
    thinkingId = null;
  }
}

function scrollToBottom() {
  const box = document.getElementById("chat-box");
  box.scrollTop = box.scrollHeight;
}

function setInputEnabled(enabled) {
  document.getElementById("send-btn").disabled = !enabled;
  document.getElementById("user-input").disabled = !enabled;
}

function setAgentActive(key) {
  ["orchestrator", "destination", "flight", "weather", "recommendation"].forEach(
    (id) => {
      document.getElementById(`badge-${id}`)?.classList.remove("active");
    }
  );
  document.getElementById(`badge-${key}`)?.classList.add("active");
}

function setAgentDone(key) {
  const badge = document.getElementById(`badge-${key}`);
  if (badge) {
    badge.classList.remove("active");
    badge.classList.add("done");
  }
}
