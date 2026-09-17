import { describe, expect, it } from "vitest";
import { type LlmServiceConfig, llmRegistry, loadLlmConfig } from "./llm.config";
import { LlmError, type LlmServiceName } from "./llm.types";

// Single-service fixture: these tests exercise one chain at a time, so the cast
// stands in for the other registry keys.
const registryWith = (entry: LlmServiceConfig): Record<LlmServiceName, LlmServiceConfig> =>
  ({ "example-summary": entry }) as Record<LlmServiceName, LlmServiceConfig>;

describe("loadLlmConfig", () => {
  describe("mode defaults", () => {
    it("defaults to real in every environment — NODE_ENV plays no part", () => {
      const registry = registryWith({ provider: "anthropic", model: "claude-sonnet-4-6", maxOutputTokens: 1024 });
      const env = { ANTHROPIC_API_KEY: "key" };
      expect(loadLlmConfig(env, registry).mode).toBe("real");
      expect(loadLlmConfig({ ...env, NODE_ENV: "development" }, registry).mode).toBe("real");
      expect(loadLlmConfig({ ...env, NODE_ENV: "production" }, registry).mode).toBe("real");
      expect(loadLlmConfig({ ...env, NODE_ENV: "test" }, registry).mode).toBe("real");
    });

    it("fails fast on a keyless default boot — real is the default even in dev", () => {
      expect(() => loadLlmConfig({})).toThrowError(/OPENAI_API_KEY/);
      expect(() => loadLlmConfig({ NODE_ENV: "development" })).toThrowError(/OPENAI_API_KEY/);
    });

    it("names every registry service the missing key strands", () => {
      expect(() => loadLlmConfig({})).toThrowError(
        "[llm] OPENAI_API_KEY is not set but the registry routes [example-summary, example-chat] to openai. " +
          "Set the key or run with LLM_MODE=fake."
      );
    });

    it("treats fake as an explicit opt-in, in any environment", () => {
      expect(loadLlmConfig({ LLM_MODE: "fake" }).mode).toBe("fake");
      expect(loadLlmConfig({ NODE_ENV: "production", LLM_MODE: "fake" }).mode).toBe("fake");
    });

    it("rejects an unknown LLM_MODE", () => {
      expect(() => loadLlmConfig({ LLM_MODE: "mock" })).toThrowError(/LLM_MODE must be "fake" or "real"/);
    });

    it("defaults agents to the native runner", () => {
      expect(loadLlmConfig({ LLM_MODE: "fake" }).agentRuntime).toBe("native");
      expect(loadLlmConfig({ LLM_MODE: "fake", AGENT_RUNTIME: "native" }).agentRuntime).toBe("native");
    });

    it("selects the OpenAI Agents SDK runner explicitly", () => {
      expect(loadLlmConfig({ LLM_MODE: "fake", AGENT_RUNTIME: "openai-agents" }).agentRuntime).toBe("openai-agents");
    });

    it("rejects an unknown agent runtime", () => {
      expect(() => loadLlmConfig({ LLM_MODE: "fake", AGENT_RUNTIME: "sdk" })).toThrowError(
        /AGENT_RUNTIME must be "native" or "openai-agents"/
      );
    });
  });

  describe("fake mode", () => {
    it("requires no keys and carries the registry", () => {
      const config = loadLlmConfig({ LLM_MODE: "fake" });
      expect(config.credentials).toEqual({});
      expect(config.registry).toBe(llmRegistry);
    });
  });

  describe("real-mode fail-fast", () => {
    it("throws a message naming the env var, the routed services and the provider", () => {
      const registry = registryWith({ provider: "anthropic", model: "claude-sonnet-4-6", maxOutputTokens: 1024 });
      expect(() => loadLlmConfig({ LLM_MODE: "real" }, registry)).toThrowError(
        "[llm] ANTHROPIC_API_KEY is not set but the registry routes [example-summary] to anthropic. " +
          "Set the key or run with LLM_MODE=fake."
      );
    });

    it("throws an LlmError with code configuration", () => {
      const registry = registryWith({ provider: "openai", model: "gpt-5-mini", maxOutputTokens: 1024 });
      let thrown: unknown;
      try {
        loadLlmConfig({ LLM_MODE: "real" }, registry);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(LlmError);
      expect((thrown as LlmError).code).toBe("configuration");
      expect((thrown as LlmError).context).toEqual({ service: "example-summary", provider: "openai" });
    });

    it("names the right env var per provider", () => {
      const cases = [
        { provider: "openai", envVar: "OPENAI_API_KEY" },
        { provider: "anthropic", envVar: "ANTHROPIC_API_KEY" },
        { provider: "google", envVar: "GEMINI_API_KEY" },
        { provider: "xai", envVar: "XAI_API_KEY" },
      ] as const;
      for (const { provider, envVar } of cases) {
        const registry = registryWith({ provider, model: "m", maxOutputTokens: 16 });
        expect(() => loadLlmConfig({ LLM_MODE: "real" }, registry)).toThrowError(new RegExp(envVar));
      }
    });

    it("requires nothing for providers the registry does not reference", () => {
      const registry = registryWith({ provider: "xai", model: "grok-4", maxOutputTokens: 1024 });
      const config = loadLlmConfig({ LLM_MODE: "real", XAI_API_KEY: "xai-key" }, registry);
      expect(config.credentials).toEqual({ xai: { apiKey: "xai-key" } });
    });

    it("covers providers referenced only as fallbacks — a keyless fallback fails the boot", () => {
      const registry = registryWith({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        maxOutputTokens: 1024,
        fallbacks: [{ provider: "openai", model: "gpt-5-mini", maxOutputTokens: 1024 }],
      });
      expect(() => loadLlmConfig({ LLM_MODE: "real", ANTHROPIC_API_KEY: "key" }, registry)).toThrowError(
        "[llm] OPENAI_API_KEY is not set but the registry routes [example-summary] to openai. " +
          "Set the key or run with LLM_MODE=fake."
      );
    });

    it("collects credentials for every chain position", () => {
      const registry = registryWith({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        maxOutputTokens: 1024,
        fallbacks: [{ provider: "openai", model: "gpt-5-mini", maxOutputTokens: 1024 }],
      });
      const config = loadLlmConfig({ LLM_MODE: "real", ANTHROPIC_API_KEY: "a-key", OPENAI_API_KEY: "o-key" }, registry);
      expect(config.credentials).toEqual({ anthropic: { apiKey: "a-key" }, openai: { apiKey: "o-key" } });
    });

    it("passes optional base URLs through to the credentials", () => {
      const registry = registryWith({ provider: "anthropic", model: "claude-sonnet-4-6", maxOutputTokens: 1024 });
      const config = loadLlmConfig(
        { LLM_MODE: "real", ANTHROPIC_API_KEY: "key", ANTHROPIC_BASE_URL: "https://proxy.example" },
        registry
      );
      expect(config.credentials.anthropic).toEqual({ apiKey: "key", baseUrl: "https://proxy.example" });
    });

    it("boots the shipped registry with the one key it names", () => {
      const config = loadLlmConfig({ LLM_MODE: "real", OPENAI_API_KEY: "o-key" });
      expect(config.mode).toBe("real");
      expect(config.credentials).toEqual({ openai: { apiKey: "o-key" } });
    });
  });

  describe("hosted-tool chains", () => {
    it("rejects a hostedTools service whose primary is not openai, naming the route", () => {
      const registry = registryWith({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        maxOutputTokens: 1024,
        hostedTools: true,
      });
      let thrown: unknown;
      try {
        loadLlmConfig({ LLM_MODE: "real", ANTHROPIC_API_KEY: "key" }, registry);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(LlmError);
      expect((thrown as LlmError).code).toBe("configuration");
      expect((thrown as LlmError).message).toContain('service "example-summary" declares hostedTools');
      expect((thrown as LlmError).message).toContain("anthropic/claude-sonnet-4-6");
      expect((thrown as LlmError).context).toEqual({
        service: "example-summary",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
      });
    });

    it("rejects a non-openai fallback on a hostedTools service — a failover would drop the retrieval", () => {
      const registry = registryWith({
        provider: "openai",
        model: "gpt-5-mini",
        maxOutputTokens: 1024,
        hostedTools: true,
        fallbacks: [{ provider: "google", model: "gemini-2.5-flash", maxOutputTokens: 1024 }],
      });
      expect(() =>
        loadLlmConfig({ LLM_MODE: "real", OPENAI_API_KEY: "o", GEMINI_API_KEY: "g" }, registry)
      ).toThrowError(/google\/gemini-2\.5-flash/);
    });

    it("fails the boot in fake mode too — chain composition is code, not env", () => {
      const registry = registryWith({
        provider: "xai",
        model: "grok-4",
        maxOutputTokens: 1024,
        hostedTools: true,
      });
      expect(() => loadLlmConfig({ LLM_MODE: "fake" }, registry)).toThrowError(/OpenAI-only/);
    });

    it("accepts the shipped registry — no service declares hostedTools", () => {
      expect(loadLlmConfig({ LLM_MODE: "fake" }).registry).toBe(llmRegistry);
      expect(llmRegistry["example-summary"].hostedTools).toBeUndefined();
      expect(llmRegistry["example-chat"].hostedTools).toBeUndefined();
    });

    it("accepts an all-openai chain and services that never declare hostedTools", () => {
      const hosted = registryWith({
        provider: "openai",
        model: "gpt-5-mini",
        maxOutputTokens: 1024,
        hostedTools: true,
        fallbacks: [{ provider: "openai", model: "gpt-5-nano", maxOutputTokens: 1024 }],
      });
      expect(loadLlmConfig({ LLM_MODE: "real", OPENAI_API_KEY: "o" }, hosted).mode).toBe("real");

      const plain = registryWith({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        maxOutputTokens: 1024,
        fallbacks: [{ provider: "google", model: "gemini-2.5-flash", maxOutputTokens: 1024 }],
      });
      expect(loadLlmConfig({ LLM_MODE: "real", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" }, plain).mode).toBe("real");
    });
  });
});
