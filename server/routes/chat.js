import { Router } from "express";
import { handleChatMessage } from "../services/orchestrator.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { message, conversationHistory } = req.body || {};
    if (!message?.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const result = await handleChatMessage(
      message.trim(),
      Array.isArray(conversationHistory) ? conversationHistory : []
    );

    res.json(result);
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message || "Chat failed" });
  }
});

export default router;
