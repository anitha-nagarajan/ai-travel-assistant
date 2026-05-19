let conversationHistory = [];
let isRunning = false;
let thinkingId = null;
let deferredInstallPrompt = null;

function apiUrl(path) {
  const base = window.APP_CONFIG?.apiBase || "";
  return `${base}${path}`;
}

window.addEventListener("DOMContentLoaded", () => {
  initHeaderToggle();
  initComposer();
  initInstallPrompt();
  registerServiceWorker();
  checkBackendHealth();
  setAgentActive("orchestrator");
  addMessage(
    "assistant",
    "👋 Welcome! I'm your AI Travel Agent.\n\n" +
      "Tell me you'd like to plan a trip — I'll ask a few questions, " +
      "then search destinations, flights, and weather for you.\n\n" +
      "Tip: on mobile, tap ⋯ to see agent status. ✈️"
  );
});

function initHeaderToggle() {
  const btn = document.getElementById("header-toggle");
  const panel = document.getElementById("header-details");
  if (!btn || !panel) return;

  btn.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Hide status details" : "Show status details");
  });

  if (window.matchMedia("(min-width: 768px)").matches) {
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }
}

function initComposer() {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input");

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input?.addEventListener("input", autoResizeTextarea);
  autoResizeTextarea.call(input);
}

function autoResizeTextarea() {
  const el = document.getElementById("user-input");
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

function initInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (localStorage.getItem("installDismissed")) return;
    const banner = document.getElementById("install-banner");
    if (banner) banner.hidden = false;
  });

  document.getElementById("install-btn")?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById("install-banner").hidden = true;
  });

  document.getElementById("install-dismiss")?.addEventListener("click", () => {
    localStorage.setItem("installDismissed", "1");
    document.getElementById("install-banner").hidden = true;
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function checkBackendHealth() {
  const bar = document.getElementById("backend-status");
  const label = document.getElementById("backend-label");
  try {
    const res = await fetch(apiUrl("/api/health"));
    const data = await res.json();
    if (data.ok) {
      bar?.classList.remove("offline");
      const keys = [];
      if (!data.anthropic) keys.push("Anthropic");
      if (!data.serpapi) keys.push("SerpApi");
      label.textContent =
        keys.length > 0
          ? `Online — configure server keys (${keys.join(", ")})`
          : "Backend online";
    } else {
      throw new Error("unhealthy");
    }
  } catch {
    bar?.classList.add("offline");
    label.textContent = window.APP_CONFIG?.apiBase
      ? "Cannot reach API — check api-base URL"
      : "Offline — start server (npm start)";
  }
}

async function sendMessage() {
  const input = document.getElementById("user-input");
  const text = input.value.trim();
  if (!text || isRunning) return;

  isRunning = true;
  setInputEnabled(false);
  input.value = "";
  autoResizeTextarea.call(input);
  addMessage("user", text);
  setThinking("💭 Thinking…");
  setAgentActive("orchestrator");

  try {
    const chatRes = await fetch(apiUrl("/api/chat"), {
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
      setThinking("🔍 Searching…");
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
  input.focus();
}

async function runSearchStream(preferences) {
  const response = await fetch(apiUrl("/api/search/stream"), {
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
        /* skip */
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
      if (level !== "done" && level !== "warn") setThinking("⏳ Working…");
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
  requestAnimationFrame(() => {
    box.scrollTop = box.scrollHeight;
  });
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
