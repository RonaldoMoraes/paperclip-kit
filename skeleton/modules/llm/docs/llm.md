# LLM

One port for every model call and one for every agent loop, over a registry of named
services that owns the vendor, the model and the failover chain. A feature injects
`LLM_CLIENT` or `AGENT_RUNNER`, names a service, and never learns which vendor answered.
Everything lives under [`apps/server/src/llm/`](../apps/server/src/llm); the two samples
under [`apps/server/src/example/`](../apps/server/src/example) are what `/feature` clones
for a feature that calls a model.

## Modes

`LLM_MODE` ([`llm.config.ts`](../apps/server/src/llm/llm.config.ts)) is `real` unless set
to `fake`, in every environment: a deploy that forgets the variable fails on its missing
key at boot rather than silently answering from the fake. `.env.example` ships
`LLM_MODE=fake` so a fresh checkout runs offline.

| mode | answers from | needs |
| --- | --- | --- |
| `fake` | one deterministic `FakeLlmProvider` behind every route: same input, same output, no network | nothing |
| `real` (default) | the vendor each registry route names | one key per provider any chain position references: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` |

`real` refuses to boot when a referenced key is missing, naming the variable and every
service it strands — fallback routes included, because a keyless fallback would turn a
failover into a second failure.

## The registry

[`llm.config.ts`](../apps/server/src/llm/llm.config.ts) is code, never a database and
never an env override: `LlmServiceName` in [`llm.types.ts`](../apps/server/src/llm/llm.types.ts)
is the union of service names and `llmRegistry` is a `Record` over it, so adding a
consumer is one literal plus one entry and the compiler refuses a missing one. Each entry
is a route — `provider`, `model`, `maxOutputTokens` (required everywhere; Anthropic
demands it), optional `temperature`, the OpenAI reasoning knobs `reasoningEffort` /
`textVerbosity` (forwarded to `gpt-5*` models, ignored by every other adapter),
`toolChoice` — plus `fallbacks`, the ordered chain walked when the route above dies, and
`hostedTools`, which pins the whole chain to OpenAI. The shipped entries:

- `example-summary` — one structured call, a same-vendor fallback to a smaller model.
- `example-chat` — the streaming turn, reasoning knobs low for a fast reply.

## How a feature calls a model

Inject the token; never a class, never a vendor:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { LLM_CLIENT, type LlmClient } from "../llm/llm.types";

@Injectable()
export class DigestService {
  constructor(@Inject(LLM_CLIENT) private readonly llm: LlmClient) {}

  headline(note: string): Promise<string> {
    return this.llm.processPrompt({
      service: "example-summary",
      messages: [
        { role: "system", content: "Answer in one sentence." },
        { role: "user", content: note },
      ],
    });
  }
}
```

`LlmClient` has four calls, all abort-aware through `signal`:

| call | answers with | what the layer does for it |
| --- | --- | --- |
| `processPrompt` | the text | retries, failover, telemetry |
| `processStructuredPrompt({ schema })` | the Zod-validated `T` | JSON steering (native strict `json_schema` on OpenAI when the schema qualifies), fence cleaning, validation, one bounded repair call, then the rest |
| `streamPrompt` | `delta` chunks ending in one `done` with usage | failover only before the first delta; abort ends the iterator quietly, with no `done` |
| `processTurn({ tools })` | `final` text or the `tool_calls` the model wants run | Zod-to-JSON-Schema once per tool, `toolChoice`, the hosted-tool chain guard |

A failure is one `LlmError` whose `code` is what a caller branches on — `configuration`,
`provider_error`, `empty_response`, `invalid_structured_output`, `max_turns_exceeded`,
`aborted` — with `context.attemptedRoutes` listing every provider/model the chain tried.

## Retries and failover

[`llm.service.ts`](../apps/server/src/llm/llm.service.ts) is the one home of the attempt
loop. Each route gets three attempts; a truncated (`length`) or empty answer fails the
attempt like a thrown vendor error. A failure the adapter classifies as `billing_quota`,
`rate_limited`, `unavailable` or `auth` hands over to the next route immediately — no
retries are burned on a dead provider — and an exhausted route hands over too. The last
route always gets the full loop, so a one-route chain is plain retry. Request
`overrides` (model, temperature, `maxOutputTokens`) shape the primary only; a fallback
runs exactly as the registry declares it.

## Agents

[`agents/agent.types.ts`](../apps/server/src/llm/agents/agent.types.ts) is the loop's
vocabulary: an `AgentDefinition` is a name, instructions, a registry `service`, optional
`tools` and an optional `outputType` (a Zod schema the final answer must satisfy — the
run then resolves to the parsed value); `maxTurns` bounds it (default 10). Tools are
`agentFunctionTool({ parameters, execute })` — arguments are Zod-validated before
`execute` runs, and a failure feeds back to the model as an `isError` result instead of
crashing the run — a nested agent exposed as a `{ input }` tool, or an OpenAI-hosted
`file_search` / `web_search` descriptor from [`hosted-tools.ts`](../apps/server/src/llm/hosted-tools.ts).

`AGENT_RUNNER.run(agent, history)` returns the output, the final text, the caller's
history plus everything the run appended (serializable — hand it back to continue the
conversation), usage summed across turns and nested runs, and the turn count.
`runStream` yields the same run as events (`turn_started`, `tool_call_completed`,
`nested_run_started`, `final_delta`, `run_completed`, …) for an SSE endpoint. A route
declared `toolChoice: "required"` means "use a tool at least once": the loop downgrades
to `auto` after the first tool-bearing turn so a run can always finish.

Two engines satisfy the port. [`agent-runner.service.ts`](../apps/server/src/llm/agents/agent-runner.service.ts)
is the default: the loop on `LlmClient` primitives, so retries, failover, fake mode,
abort and telemetry hold per step. `AGENT_RUNTIME=openai-agents` swaps in
[`providers/openai-agents.service.ts`](../apps/server/src/llm/providers/openai-agents.service.ts),
the OpenAI Agents SDK behind the same port: OpenAI routes only, one telemetry pair per
run instead of per turn, SDK tracing on with sensitive data excluded. It always reaches
the real vendor — `LLM_MODE=fake` does not apply to it.
[`agents/agent-runtime-conformance.spec.ts`](../apps/server/src/llm/agents/agent-runtime-conformance.spec.ts)
runs the port's claims against both, offline, and names the gaps between them.

## The samples

[`example/example-summary.agent.ts`](../apps/server/src/example/example-summary.agent.ts)
— `buildExampleSummaryAgent(inputs): AgentDefinition<ExampleSummary>`: the fixed facts
go into the instructions, the Zod schema is the contract, the service is a registry
name. Its spec runs it over the fake and asserts what the model was sent.

[`example/example.repl.ts`](../apps/server/src/example/example.repl.ts) — `yarn example:repl`
builds the stack by hand (no Nest): `loadLlmConfig`, `buildProviderMap`, `LlmService`,
`AgentRunnerService`. It runs the summary agent once, then streams one `example-chat`
reply per stdin line; EOF ends it. Fake is its default even when the app's is real;
`LLM_MODE=real yarn example:repl` uses the registry's routes and the keys in `.env`.

## What telemetry hears

[`llm.ports.ts`](../apps/server/src/llm/llm.ports.ts) is the domain's one observability
seam, bound by `LlmModule` to the base `TELEMETRY` port through `llmTelemetryOver`: every
attempt is an `llm.call.started` / `llm.call.ended` event pair — request id, the
caller's `referenceId`, service, provider, model, mode, attempt number, duration,
usage, finish reason, outcome — a structured-output failure is a `warn` line with the
failure kind and detail, and a terminal failure is a captured error. The invalid model
output itself never crosses the port: it may hold what a user wrote, and the sink may be
a third party. Specs and scripts use `noopLlmTelemetry`.

## Adapters

[`providers/`](../apps/server/src/llm/providers) holds one adapter per vendor, each a
dumb transport behind `LlmProviderAdapter` in `provider.types.ts`: convert messages, map
parameters, extract usage and tool calls, normalize the finish reason to `stop` /
`length` / `tool_calls`, classify a thrown error for the failover policy. No retries, no
validation, no logging — that loop exists once, in the service.

- **openai** — the Responses API; strict `json_schema`; reasoning knobs on `gpt-5*`; the
  only adapter that runs hosted tools.
- **anthropic** — the Messages API; system messages joined into `system`; JSON steered by
  a sentence the cleaning layer backs up; exhausted credit is a 400 naming the balance.
- **google** — `@google/genai`; `systemInstruction`; `application/json` mime steering;
  synthesized call ids when Gemini mints none; 429s split into billing vs rate limit by
  message.
- **xai** — through the AI SDK (`ai` + `@ai-sdk/xai`) with its own retries off.
- **fake** — no network, no keys: FIFO scripting (`enqueue`, `enqueueToolCalls`,
  `enqueueError(category)`), deterministic echo and usage, every call on `calls`.

The vendor SDKs are imported only under `providers/` — `biome/llm-provider-imports.grit`
errors on any other import — and `@openai/agents` only by `openai-agents.service.ts`
(`biome/openai-agents-imports.grit`); `yarn lint:guards` proves both guards fire.

**Adding a vendor** is one adapter file under `providers/`, one literal in
`LlmProviderName`, one key in `KEY_ENV_BY_PROVIDER` and one branch in
[`build-provider-map.ts`](../apps/server/src/llm/providers/build-provider-map.ts), plus
the SDK's scope in the guard's regex and canary fixture. Nothing outside `llm/` changes.

## Wiring

[`llm.module.ts`](../apps/server/src/llm/llm.module.ts) is wiring only: `LLM_CONFIG`
from `loadLlmConfig(process.env)` (the domain's only env reader), `LLM_TELEMETRY` over
the base port, `LLM_CLIENT` as `LlmService` over `buildProviderMap(config)`, and
`AGENT_RUNNER` as whichever engine `AGENT_RUNTIME` names. `module.json` puts `LlmModule`
in `KIT_MODULES` and exports the two tokens.
