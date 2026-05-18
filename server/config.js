import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 3000,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  serpApiKey: process.env.SERPAPI_KEY || "",
  sonnetModel: "claude-sonnet-4-20250514",
  haikuModel: "claude-haiku-4-5-20251001",
  haikuGapMs: 12_000,
  cacheTtlMs: 24 * 60 * 60 * 1000
};

export function assertConfig() {
  const missing = [];
  if (!config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY");
  if (!config.serpApiKey) missing.push("SERPAPI_KEY");
  if (missing.length) {
    console.warn(
      `Warning: missing env vars: ${missing.join(", ")}. ` +
        "Copy .env.example to .env and add your keys."
    );
  }
}
