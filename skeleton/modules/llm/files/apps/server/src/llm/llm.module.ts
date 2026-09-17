import { Module } from "@nestjs/common";
import { TELEMETRY, type Telemetry } from "../common/ports/telemetry";
import { AGENT_RUNNER } from "./agents/agent.types";
import { AgentRunnerService } from "./agents/agent-runner.service";
import { LLM_CONFIG, type LlmConfig, loadLlmConfig } from "./llm.config";
import { LLM_TELEMETRY, type LlmTelemetry, llmTelemetryOver } from "./llm.ports";
import { LlmService } from "./llm.service";
import { LLM_CLIENT, type LlmClient } from "./llm.types";
import { buildProviderMap } from "./providers/build-provider-map";
import { OpenAiAgentsService } from "./providers/openai-agents.service";

/**
 * Wiring only. Consumers depend on the tokens, never on classes:
 * `constructor(@Inject(LLM_CLIENT) private readonly llm: LlmClient) {}` for
 * plain calls, `@Inject(AGENT_RUNNER)` for the agent loop. Env is read inside
 * the config factory, so importing anything else here reads none. The domain's
 * telemetry rides the app's `TELEMETRY` port, which `PortsModule` binds globally.
 */
@Module({
  providers: [
    {
      provide: LLM_CONFIG,
      useFactory: (): LlmConfig => loadLlmConfig(process.env),
    },
    {
      provide: LLM_TELEMETRY,
      inject: [TELEMETRY],
      useFactory: (telemetry: Telemetry): LlmTelemetry => llmTelemetryOver(telemetry),
    },
    {
      provide: LLM_CLIENT,
      inject: [LLM_TELEMETRY, LLM_CONFIG],
      useFactory: (telemetry: LlmTelemetry, config: LlmConfig): LlmService => {
        return new LlmService(config, buildProviderMap(config), telemetry);
      },
    },
    {
      provide: AGENT_RUNNER,
      inject: [LLM_CLIENT, LLM_CONFIG, LLM_TELEMETRY],
      useFactory: (
        client: LlmClient,
        config: LlmConfig,
        telemetry: LlmTelemetry
      ): AgentRunnerService | OpenAiAgentsService =>
        // "native" — the product's own loop — is the default; the SDK adapter is the AGENT_RUNTIME opt-in.
        config.agentRuntime === "openai-agents"
          ? new OpenAiAgentsService(config, telemetry)
          : new AgentRunnerService(client),
    },
  ],
  exports: [LLM_CLIENT, AGENT_RUNNER],
})
export class LlmModule {}
