# Benchmark: Paperclip Kit vs Superpowers vs plain Claude Code

Does the kit's company-and-harness layer pay for itself? This benchmark runs one real task three times, one approach at a time, under identical conditions. It measures wall time and tokens for each phase, and grades quality blind.

```bash
bench/bench.sh                 # all three: raw → superpowers → paperclip, then judge + report
bench/bench.sh paperclip       # one approach (judge and report need all three)
node bench/report.mjs          # rebuild the table at any time
```

Output goes to `~/paperclip-bench/runs/`: one folder per approach (`ws/` is its workspace, `out/` its logs), plus `REPORT.md` and `results.json`. To add your own 1–5 scores beside the judge's, write `runs/founder-scores.json` as `{ "raw": { "plan": 4, "implementation": 3, "verification": 4 }, … }`.

## What is held equal

| | |
|---|---|
| Fixture | `paperclip-cars` at `4df0547`, a kit-scaffolded NestJS, React and Prisma product. Each approach gets a fresh clone, with dependencies installed before the clock starts. |
| Task | [`TASK.md`](TASK.md): vehicle inventory v1, a real next feature. It touches the schema, shared contracts, the server, the web app and tests. |
| Model | `claude-opus-5-5` on the main thread. Each approach routes its own subagents (for example, the kit's `engineer` runs on `sonnet`), because that routing is part of what's being measured. |
| Isolation | `--setting-sources project,local` and `--strict-mcp-config` with the fixture's own MCP server, so none of your user plugins, MCP servers or settings load. Superpowers is added with `--plugin-dir` for its run only. The kit is installed in the paperclip workspace only. |
| Database | One Postgres container for the benchmark (`pcbench-postgres`, port 5439), with a database per workspace. It never touches the fixture's own container. |
| Conditions | [`prompts/preamble.md`](prompts/preamble.md): unattended, recommended choices taken without asking, no worktrees, no push. |

**How each approach starts.** Plain Claude Code gets the task. Superpowers gets the same task and nothing more: its session-start hook makes it use its own skills. The kit gets `paperclip on` followed by the task, and triages it as it normally would.

## Phases

Each phase is one headless turn in the same session (`claude -p`, then `--resume`), ending when the model prints `PHASE-DONE: <phase>`. If a turn ends early, typically on a question nobody will answer, the runner nudges up to 3 times.

| phase | the extra steps each approach runs here |
|---|---|
| **plan** | triage, goal card, work order, critic, probes · brainstorming, writing-plans |
| **implement** | slices + checkpoints · subagent-driven development, TDD, per-task review |
| **verify** | close review, full suite, fixes, tally · verification-before-completion, code review, finishing |

## Measurements

- **Time.** Wall clock per phase, nudges included. Waits for a usage-limit reset are recorded separately and excluded.
- **Tokens.** The difference in Claude Code's cumulative `modelUsage` for the session. Subagents are included, split by model. The report separates *fresh* tokens (input, output and cache writes) from *cache reads*, which dominate the total but cost about a tenth as much. It also shows the list-price cost that Claude Code reports.
- **Quality.** The judge sees each attempt's plan, final diff, verify report and `gates.txt`. `gates.txt` is ground truth: the repo's 7 gates plus [`acceptance.mjs`](acceptance.mjs), a hidden black-box check (21 checks over real HTTP, with two real signed-in users, per-user isolation, validation, and persistence across a restart). The judge scores 1–5 per phase ([`prompts/judge.md`](prompts/judge.md)), grading all three side by side under random X/Y/Z labels with the words that name a process scrubbed out.

Baseline at `4df0547`: all 7 gates green, acceptance 0/21.

## Limits

One run per approach, so the variance is unknown. A 20–30% gap in time is within what a single rerun could change. The judge is a model, and blinding is only partial because process style shows through. Splitting the work into phases imposes turn boundaries that no approach would choose on its own. The kit starts from a fresh ledger with no accumulated `research/` or `STORY.md`.
