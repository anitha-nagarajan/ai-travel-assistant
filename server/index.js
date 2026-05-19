import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config, assertConfig } from "./config.js";
import chatRouter from "./routes/chat.js";
import searchRouter from "./routes/search.js";
import healthRouter from "./routes/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

assertConfig();

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use("/api/health", healthRouter);
app.use("/api/chat", chatRouter);
app.use("/api/search", searchRouter);

app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(config.port, () => {
  console.log(`AI Travel Assistant v4 → http://localhost:${config.port}`);
});
