# Paperclip Lite — design

> Status: **implemented in 1.0.0** (2026-09-27). The shipped layer is `template/`: `COMPANY.md` is
> this design made operational. Evidence is in [`bench/RESULTS.md`](../bench/RESULTS.md).

A lighter company layer. It keeps what the Founder values in Paperclip: the control panel, the
company-style team, and nothing living only in a transcript. It drops the machinery that made
Paperclip slow. The engineering engine becomes [Superpowers](https://github.com/obra/superpowers),
unmodified.

## 1. What it must do

1. **Save time and tokens.** A feature costs about what plain Claude Code costs, not a multiple of it.
2. **Brainstorm and be creative.** The Founder can think out loud with a CEO, CTO or CMO before anything is planned.
3. **Plan well.** Every non-trivial change has a written, reviewable plan.
4. **Execute with discipline and quality.** Tests first, a review per task, and gates as the definition of done.
5. **Stay portable.** Work can continue with another provider or model at any point: Codex, Gemini CLI, OpenCode, or another Claude model.

## 2. What the benchmark says

Same task for every approach: vehicle inventory v1 on `paperclip-cars`, from the same commit, with the same model, one approach at a time.

| Awake minutes | Raw | Superpowers | Superpowers + ai-memory | ECC | Paperclip 0.3 |
|---|---:|---:|---:|---:|---:|
| Plan phase | 8.7 | 14.5 | 14.7 | 8.1 | **68.1** |
| Whole task | 49.6 | 51.6 | 42.9 | 49.9 | **197+**, stopped at 9 of 11 slices |
| Cost (list price) | $17.01 | $19.00 | $18.35 | $24.83 | **≥ $57.77** at the stop |
| Hidden acceptance check | 21/21 | 21/21 | 21/21 | 21/21 | not evaluated |
| Blind judge, plan/impl/verify | 5/5/5 | 3/4/5 | 4/4/5 | 3/4/4 | — |

Where Paperclip's time went ([`bench/overhead.mjs`](../bench/overhead.mjs)):

- **A relay of agents for one feature.** Orchestrator → tech-lead → critic → tech-lead → critic, then an engineer run and a tech-lead checkpoint for each of 11 slices. Every hand-off rebuilt context.
- **One 101 KB document at the center.** The work order was read or edited about 70 times, by every agent.
- **Hand-kept bookkeeping.** 153 ledger calls (`pc task …`, `pc finding …`): 20.9 agent-minutes, 1.09M fresh tokens (more than Raw's entire run) and ~$8.61. Each call is a full API round trip that re-reads the agent's context.
- **Always the full tier.** The task touched schema and contracts, so policy forced the full loop whatever its uncertainty.

(An early read also blamed 103 "dead minutes" on Paperclip's large outputs. That was wrong: they were the Mac sleeping with the display off. See `bench/RESULTS.md` › Sleep. The awake times above exclude sleep.)

What was cheap and worth keeping: the control panel, the decision log, and the roles as ways of thinking.

## 3. Principles

1. **Roles are lenses, not agents.** "CTO mode" changes how the main conversation thinks; it doesn't spawn anyone. Talking to the company costs nothing extra.
2. **Agents only for breadth.** Spawn agents for independent pieces that can run in parallel. Never pass one feature down a chain of agents.
3. **Each agent gets only its slice.** A subagent receives its task's text, not the whole plan. Superpowers' subagent-driven development already works this way.
4. **Capture is automatic; judgment is written.** Hooks record what happened at zero model cost. The model writes only what needs judgment: decisions, the control panel, the handoff.
5. **Ceremony matches uncertainty, not topic.** Touching auth or schema doesn't force the heavy path by itself. Being unsure does.
6. **Plans stay proportionate.** A plan says what and why, and specifies code only where it's subtle. The judge called both Superpowers plans (~300 and ~357 KB of fully written code) "ceremony out of proportion to the task", and they scored lower on planning than the plain plan.
7. **Delegate in the foreground.** Never end a turn waiting on a background agent.
8. **Plain markdown in the repo.** Every rule and record is a file any agent on any provider can read.

## 4. Architecture

```
┌─ Front office (this kit) ──────────────────────────────────────────┐
│  Founder ⇄ main conversation in a role lens (CEO · CTO · CMO · …)  │
│  STATUS.md control panel · decisions.md · findings.md              │
│  /where /decide /role /hire /handoff · triage                      │
└───────────────┬────────────────────────────────────────────────────┘
                │ routes work into
┌───────────────▼─ Engineering engine: Superpowers (unmodified) ─────┐
│  brainstorming → writing-plans → subagent-driven-development       │
│  (TDD, a review per task) → verification-before-completion →       │
│  requesting-code-review · dispatching-parallel-agents for breadth  │
└───────────────┬────────────────────────────────────────────────────┘
                │ observed by
┌───────────────▼─ Memory ───────────────────────────────────────────┐
│  automatic capture + handoff + search (ai-memory, or plain files §6)│
└────────────────────────────────────────────────────────────────────┘
The kit's engineering/ and skeleton/ layers (/grill /scaffold /feature /module) are unchanged.
```

### Triage: one question, as before, mapped to Superpowers

| Tier | When | What runs |
|---|---|---|
| **Direct** | the change and its check fit in ~10 lines | do it in the main conversation, then `verification-before-completion` |
| **Planned** | not certain, but one person's work | `writing-plans` (short) → `executing-plans` inline |
| **Full** | big, or genuinely uncertain | `brainstorming` → `writing-plans` → `subagent-driven-development` → one final `requesting-code-review` |
| **Campaign** | many independent units against one contract | the plan names the units; `dispatching-parallel-agents` runs them; one writer per file |

A plan critique is added only for **real risk**: a destructive migration, money, or an auth change that can lock users out. Never because of the topic alone.

## 5. Keep · change · drop

| Paperclip 0.3 | Lite | Why |
|---|---|---|
| `CLAUDE.local.md` toggle, Founder UX | **keep** (trimmed) | cheap, and it's the product |
| `STATUS.md` control panel, `/where` | **keep**; `/where` also reads the plan's task list and the memory handoff | the Founder's most-used view |
| `decisions.md`, `/decide` | **keep** | written judgment, rarely touched |
| CEO · CTO · CRGO · CMO · UI/UX personas | **keep as lenses** (one short card each) | ~1 KB each, no agent spawned |
| Researcher | **keep as an agent** | research runs in parallel (breadth) |
| `/hire`, `/role` | **keep** | |
| `tech-lead`, `engineer`, `critic` personas | **drop** → Superpowers' implementer and reviewer | duplicated the engine, and were the relay |
| `HARNESS.md`, `/build`, work orders, checkpoints, surprise limits | **drop** → Superpowers' flow with the triage above | 144 min plan phase vs 15 |
| `briefs/` blocks | **drop** | Superpowers writes the subagent prompts |
| `pc` ledger (tasks, scope locks, estimates) | **drop** in-flight bookkeeping; keep `findings.md` as one markdown queue | 104 round trips; capture becomes automatic |
| `pc handoff`, `/handoff` | **replace** with the memory handoff, plus one `STATUS.md` update | |
| `PLAYBOOK.md` (12.8 KB) | **shrink** to ~3 KB: roles, triage, the rules above | read every session |

About 106 KB of company-layer instructions and a 3.5k-line CLI become about 15 KB of markdown, plus Superpowers as a plugin.

## 6. Memory: decided, **ai-memory**

Run 4 (Superpowers + ai-memory) took 42.9 min and $18.35, against 51.6 min and $19.00 for plain Superpowers. That's inside the rule below, with 21/21 acceptance and judge scores of 4/4/5 vs 3/4/5. The agent never called its 23 tools during the run, while the hooks captured 389 observations for free. So its single-session cost is about zero. Its benefit (cold starts, machines, providers) is still unmeasured. Plain files remain the fallback if the server ever becomes a burden.

| | ai-memory | Plain files |
|---|---|---|
| Capture | automatic: hooks on every prompt and tool call, zero LLM calls | none: only what the model writes |
| Handoff | typed, claimed once, across harnesses and machines | `STATUS.md` + a `HANDOFF.md` written at session end |
| Search | full-text + entity + graph over a git-backed markdown wiki | `grep` |
| Providers | Claude Code, Codex, Gemini CLI, OpenCode and 20+ more | anything that reads `AGENTS.md` |
| Cost | a local server, 23 MCP tools, ~1.5k tokens of instructions per session, 2 hook POSTs per tool call | nothing |

**Decision rule, fixed before the run:** adopt ai-memory if run 4 stays within ~10% of plain Superpowers on time and cost, with no drop in quality. Otherwise use plain files, and revisit ai-memory when working across machines or with teammates. The single-session run measures only its **cost**. Its benefit shows up at cold starts, which a later handoff run (plan → new session → another provider) would measure.

## 7. Portability

- **One rulebook: `AGENTS.md`.** Claude Code gets it through a first line `@AGENTS.md` in `CLAUDE.md`. Codex, Gemini CLI and OpenCode read it natively.
- **Engine:** Superpowers ships for Codex, Gemini and OpenCode as well as Claude Code.
- **State:** `STATUS.md`, `decisions.md`, `findings.md`, and Superpowers' specs and plans are plain markdown. The memory layer is either markdown too (plain files) or a git-backed markdown wiki (ai-memory).
- **Switching:** open the other agent in the same directory. It reads `AGENTS.md`, then `STATUS.md` and the handoff, and continues.
- **Open question:** the front office is personal and local-only today (`CLAUDE.local.md`, git-excluded), while `AGENTS.md` is shared with the team. Each provider needs a local, uncommitted place to load the front office from. Verify this per provider before relying on it.

## 8. Build order

1. **Front office.** Trimmed toggle, the role cards, `STATUS.md`, `decisions.md`, `findings.md`, and `/where` `/decide` `/role` `/hire` `/handoff` rewritten against Superpowers' artifacts.
2. **Triage routing.** One short section that maps the tiers onto Superpowers skills (§4).
3. **Memory.** The winner of §6.
4. **Installer.** `install.sh` installs Lite plus Superpowers, never clobbers, same local-only exclude.
5. **Prove it.** Add `paperclip-lite` to `bench/config.json` and run it on the same task. **Target:** time and cost within ~15% of plain Superpowers, acceptance 21/21, a judge score at least Superpowers' on every phase.
6. **Second pilot, of a different shape** (UI or a bug hunt), before calling the defaults settled.
