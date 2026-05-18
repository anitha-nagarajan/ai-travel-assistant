import { Router } from "express";
import { config } from "../config.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    version: "4",
    anthropic: Boolean(config.anthropicApiKey),
    serpapi: Boolean(config.serpApiKey)
  });
});

export default router;
