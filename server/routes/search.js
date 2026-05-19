import { Router } from "express";
import { normalizePreferences } from "../lib/utils.js";
import { runSearchPipeline } from "../services/pipeline.js";

const router = Router();

router.post("/stream", async (req, res) => {
  let preferences;
  try {
    preferences = normalizePreferences(req.body?.preferences || {});
  } catch {
    return res.status(400).json({ error: "Invalid preferences" });
  }

  if (!preferences.departure_airports?.length) {
    return res.status(400).json({ error: "departure_airports required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const emit = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await runSearchPipeline(preferences, emit);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  } catch (err) {
    console.error("Search pipeline error:", err);
    res.write(
      `data: ${JSON.stringify({ type: "error", message: err.message || "Search failed" })}\n\n`
    );
  }

  res.end();
});

export default router;
