- **An LLM call names a service, never a vendor.** A feature injects `LLM_CLIENT`
  (`LlmClient`) for a call or `AGENT_RUNNER` (`AgentRunner`) for a tool loop and passes a
  service name from the registry in `apps/server/src/llm/llm.config.ts`; the registry —
  code, never env — owns the provider, the model, the knobs and the failover chain.
  Vendor SDKs (`openai`, `@openai/*`, `@anthropic-ai/*`, `@google/genai`, `ai`,
  `@ai-sdk/*`) import only under `apps/server/src/llm/providers/`
  (`llm-provider-imports.grit`); `@openai/agents` only in
  `providers/openai-agents.service.ts` (`openai-agents-imports.grit`). Every consumer is
  testable with `LLM_MODE=fake`: a spec scripts `FakeLlmProvider` and asserts on its
  `calls` — nothing mocks a vendor, nothing needs a key.
