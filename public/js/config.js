/**
 * API base URL for fetch calls.
 * - "" (default): same host as the UI (npm start or deployed full stack)
 * - "https://your-api.example.com": required for Capacitor native builds
 *   when the bundled UI is not served from your backend
 */
(function () {
  const meta = document.querySelector('meta[name="api-base"]');
  const fromMeta = meta?.getAttribute("content")?.trim() || "";
  const fromStorage = localStorage.getItem("travelAgentApiBase") || "";

  window.APP_CONFIG = {
    apiBase: (fromMeta || fromStorage).replace(/\/$/, "")
  };
})();
