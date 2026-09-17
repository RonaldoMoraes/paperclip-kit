import type { LlmConfig } from "../llm.config";
import type { LlmProviderName } from "../llm.types";
import { AnthropicProvider } from "./anthropic.provider";
import { FakeLlmProvider } from "./fake.provider";
import { GoogleProvider } from "./google.provider";
import { OpenAiProvider } from "./openai.provider";
import type { LlmProviderAdapter } from "./provider.types";
import { XaiProvider } from "./xai.provider";

function buildRealAdapter(provider: Exclude<LlmProviderName, "fake">, config: LlmConfig): LlmProviderAdapter {
  const missing = (): Error =>
    new Error(`[llm] Missing credentials for provider "${provider}" — loadLlmConfig should have failed fast.`);
  switch (provider) {
    case "openai": {
      const credentials = config.credentials.openai;
      if (!credentials) throw missing();
      return new OpenAiProvider(credentials);
    }
    case "anthropic": {
      const credentials = config.credentials.anthropic;
      if (!credentials) throw missing();
      return new AnthropicProvider(credentials);
    }
    case "google": {
      const credentials = config.credentials.google;
      if (!credentials) throw missing();
      return new GoogleProvider(credentials);
    }
    case "xai": {
      const credentials = config.credentials.xai;
      if (!credentials) throw missing();
      return new XaiProvider(credentials);
    }
  }
}

/**
 * Fake mode routes every registry provider to one shared FakeLlmProvider; real
 * mode constructs one adapter per provider the registry references. Providers
 * the registry does not reference are never instantiated.
 */
export function buildProviderMap(config: LlmConfig): Map<LlmProviderName, LlmProviderAdapter> {
  // Fallback routes reference providers too — a chain position without an
  // adapter would fail at failover time, not at bootstrap.
  const referenced = new Set<Exclude<LlmProviderName, "fake">>();
  for (const entry of Object.values(config.registry)) {
    referenced.add(entry.provider);
    for (const fallback of entry.fallbacks ?? []) referenced.add(fallback.provider);
  }
  const map = new Map<LlmProviderName, LlmProviderAdapter>();
  if (config.mode === "fake") {
    const fake = new FakeLlmProvider();
    for (const provider of referenced) map.set(provider, fake);
    return map;
  }
  for (const provider of referenced) map.set(provider, buildRealAdapter(provider, config));
  return map;
}
