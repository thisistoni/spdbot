import type { AppConfig } from "./config.ts";

export const CLAUDE_API_INSTANCE = "claudeApi";

export function injectAnthropicEnvironment(environment: Map<string, string>, cfg: AppConfig, instanceId: string, driver: string): void {
  // "Claude (API key)" always runs on the key; "every Claude bot" adds every other Claude instance, never takes it away
  // from bots already set to Claude (API key), such as a starter bot made before any Claude sign-in.
  const anthropicHere = driver === "claudeAgent" && Boolean(cfg.anthropic?.key)
    && (instanceId === CLAUDE_API_INSTANCE || cfg.anthropic?.everyClaudeBot !== false);
  if (anthropicHere) environment.set("ANTHROPIC_API_KEY", cfg.anthropic!.key!);
  if (anthropicHere && cfg.anthropic!.url) environment.set("ANTHROPIC_BASE_URL", cfg.anthropic!.url);
}
