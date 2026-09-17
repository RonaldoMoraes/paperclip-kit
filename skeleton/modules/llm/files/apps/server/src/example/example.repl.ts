/**
 * The sample REPL: the LLM stack built by hand — no Nest — so a prompt or an agent
 * definition can be exercised from a terminal before any endpoint exists. A script
 * entry point, not a service: it runs only as `yarn example:repl` (the require.main
 * guard below), never on import.
 *
 * Modes (the harness defaults to fake so it always runs offline; the app default stays real):
 *   yarn example:repl                    — fake: deterministic answers, zero keys, no network
 *   LLM_MODE=real yarn example:repl      — the registry's real routes; needs the keys they name
 *
 * What it does: runs the summary agent once over the example items and prints the
 * structured result, then turns every line on stdin into one streamed `example-chat`
 * reply that remembers the turns before it. EOF ends it, so
 * `echo "hello" | yarn example:repl` is a complete run.
 */
import { createInterface } from "node:readline";
import { MOCK_ITEMS } from "@contracts/example/mock-library";
import { AgentRunnerService } from "../llm/agents/agent-runner.service";
import { type LlmConfig, loadLlmConfig } from "../llm/llm.config";
import { noopLlmTelemetry } from "../llm/llm.ports";
import { LlmService } from "../llm/llm.service";
import type { LlmMessage, LlmProviderName } from "../llm/llm.types";
import { buildProviderMap } from "../llm/providers/build-provider-map";
import { FakeLlmProvider } from "../llm/providers/fake.provider";
import type { LlmProviderAdapter } from "../llm/providers/provider.types";
import { type ExampleSummary, buildExampleSummaryAgent } from "./example-summary.agent";

/** What the fake answers the summary agent with — the deterministic fixture a real run would produce. */
const OPEN_ITEMS = MOCK_ITEMS.filter((item) => !item.done);
const FAKE_SUMMARY: ExampleSummary = {
  headline: `${OPEN_ITEMS.length} open, ${MOCK_ITEMS.length - OPEN_ITEMS.length} done.`,
  highlights: OPEN_ITEMS.map((item) => item.title),
  nextStep: OPEN_ITEMS[0]?.title ?? "",
  openCount: OPEN_ITEMS.length,
};

/**
 * In fake mode every route shares one FakeLlmProvider, whose unscripted JSON answer
 * is "{}" on purpose — a schema failure, so a test cannot pass on the default. The
 * REPL scripts the summary the way a spec does; the chat turns need nothing, the
 * fake echoes the last user line.
 */
function scriptFakeAnswers(adapters: Map<LlmProviderName, LlmProviderAdapter>): void {
  const fake = [...adapters.values()].find((adapter) => adapter instanceof FakeLlmProvider);
  if (fake) fake.enqueue(JSON.stringify(FAKE_SUMMARY));
}

async function summarize(agents: AgentRunnerService): Promise<void> {
  const result = await agents.run(buildExampleSummaryAgent({ items: MOCK_ITEMS }), [
    { role: "user", content: "Where do I stand?" },
  ]);
  console.log("[example:repl] summary:");
  console.log(JSON.stringify(result.output, null, 2));
  console.log(
    `[example:repl] ${result.turns} turn(s) · ${result.usage.inputTokens ?? "?"} in / ${result.usage.outputTokens ?? "?"} out`
  );
}

async function chat(llm: LlmService, config: LlmConfig): Promise<void> {
  const history: LlmMessage[] = [
    { role: "system", content: "You answer briefly, in one or two sentences, about the person's items." },
  ];
  const input = createInterface({ input: process.stdin });
  const prompt = (): void => {
    if (process.stdin.isTTY) process.stdout.write("> ");
  };
  console.log(`[example:repl] chat on ${config.registry["example-chat"].model} — one line per turn, EOF ends`);
  prompt();
  for await (const raw of input) {
    const line = raw.trim();
    if (!line) {
      prompt();
      continue;
    }
    history.push({ role: "user", content: line });
    let reply = "";
    for await (const chunk of llm.streamPrompt({ service: "example-chat", messages: history })) {
      if (chunk.type === "delta") {
        process.stdout.write(chunk.text);
        continue;
      }
      reply = chunk.fullText;
      process.stdout.write(`\n[example:repl] ${chunk.model} · ${chunk.usage.outputTokens ?? "?"} out\n`);
    }
    if (reply) history.push({ role: "assistant", content: reply });
    prompt();
  }
}

async function main(): Promise<void> {
  const { config: loadDotenv } = await import("dotenv");
  loadDotenv({ quiet: true });

  // Fake is this harness's default — it must run with no keys and no network.
  const env: Record<string, string | undefined> = { ...process.env, LLM_MODE: process.env.LLM_MODE ?? "fake" };
  const config = loadLlmConfig(env);
  const adapters = buildProviderMap(config);
  if (config.mode === "fake") scriptFakeAnswers(adapters);
  const llm = new LlmService(config, adapters, noopLlmTelemetry);
  const agents = new AgentRunnerService(llm);

  console.log(`[example:repl] mode=${config.mode} items=${MOCK_ITEMS.length}`);
  await summarize(agents);
  await chat(llm, config);
  console.log("[example:repl] bye");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
