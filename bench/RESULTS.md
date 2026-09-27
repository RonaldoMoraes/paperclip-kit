# Results: 2026-09-25 to 27 (seven approaches, three judge passes)

Task: [vehicle inventory v1](TASK.md) on `paperclip-cars` @ `4df0547`. Main-thread model: `claude-opus-5-5`. One approach at a time; one run each. Method: [README](README.md).

## The table

| Approach | Phase | Awake time¹ (min) | Wall clock (min) | Fresh tokens² | Cache reads | Cost³ | Judge, pass 1 → 2 → 3 |
|---|---|---:|---:|---:|---:|---:|---:|
| **Raw Claude** | plan | 8.7 | 8.7 | 312k | 6.01M | $3.98 | 5 → 5 → 5 |
| | implement | 33.7 | 33.7 | 308k | 26.21M | $9.22 | 5 → 5 → 5 |
| | verify | 7.2 | 7.2 | 162k | 11.67M | $3.82 | 5 → 5 → 5 |
| | **total** | **49.6** | 49.6 | **781k** | 43.9M | **$17.01** | 7/7 gates · **21/21** |
| **Superpowers** | plan | 14.5 | 14.5 | 435k | 5.08M | $5.69 | 3 → 4 → 4 |
| | implement | 30.8 | 30.8 | 222k | 30.99M | $9.00 | 4 → 4 → 4 |
| | verify | 6.3 | 6.3 | 161k | 14.30M | $4.31 | 5 → 4 → 4 |
| | **total** | **51.6** | 51.6 | **817k** | 50.4M | **$19.00** | 7/7 · **21/21** |
| **Superpowers + ai-memory** | plan | 14.7 | 14.7 | 330k | 3.84M | $4.56 | 4 → 5 → 5 |
| | implement | 19.4 | 19.4 | 221k | 27.67M | $8.35 | 4 → 5 → 5 |
| | verify | 8.8 | 8.8 | 196k | 18.01M | $5.45 | 5 → 5 → 5 |
| | **total** | **42.9** | 42.9 | **747k** | 49.5M | **$18.35** | 7/7 · **21/21** |
| **ECC** | plan | 8.1 | 23.1 | 406k | 4.57M | $4.34 | 3 → 4 → 4 |
| | implement | 31.2 | 286.4 | 478k | 43.98M | $14.70 | 4 → 4 → 4 |
| | verify | 10.6 | 40.7 | 339k | 19.91M | $5.80 | 4 → 5 → 4 |
| | **total** | **49.9** | 350.2 | **1.22M** | 68.5M | **$24.83** | 7/7 · **21/21** |
| **Superpowers + ECC** | plan | 17.3 | 17.3 | 420k | 3.93M | $5.49 | — → 4 → 4 |
| | implement | 87.2 | 87.2 | 2.23M | 60.60M | $23.78 | — → 4 → 4 |
| | verify | 22.2 | 22.2 | 551k | 27.36M | $10.01 | — → 5 → 4 |
| | **total** | **126.7** | 126.7 | **3.20M** | 91.9M | **$39.28** | 7/7 · **21/21** |
| **Paperclip 0.3** (stopped at 9 of 11 slices) | plan | 68.1 | 143.8 | 2.38M | 70.82M | $33.05 | — |
| | implement | 128.9 | 163.8 | 3.33M | 108.3M | ≥ $24.72⁴ | — |
| | verify | not reached | — | — | — | — | — |
| | **total at stop** | **197.0+** | 307.6 | **5.71M** | 179.1M | **≥ $57.77** | not evaluated |
| **Paperclip 1.0** (this repo) | plan | 6.4 | 6.4 | 194k | 3.81M | $2.77 | — → — → 4 |
| | implement | 21.4 | 21.4 | 304k | 25.08M | $8.85 | — → — → 4 |
| | verify | 12.5 | 12.5 | 261k | 18.79M | $6.21 | — → — → 5 |
| | **total** | **40.3** | 40.3 | **758k** | 47.7M | **$17.83** | 7/7 · **21/21** |

¹ Wall clock minus the time the Mac was asleep, taken from `pmset -g log`. See "Sleep" below. ·
² Input + output + cache writes, subagents included. ·
³ List-price equivalent as Claude Code reports it. On a subscription this is usage, not a bill. ·
⁴ Lower bound: the unfinished phase's Sonnet calls have no reported price.

**Blind judge**, three passes, each re-grading every finisher side by side under new random labels with process names scrubbed:
- **Pass 1 (4 finishers):** Raw > Superpowers + ai-memory > ECC > Superpowers.
- **Pass 2 (5 finishers):** Superpowers + ai-memory > Raw > ECC > Superpowers + ECC > Superpowers.
- **Pass 3 (6 finishers):** **Raw > Superpowers + ai-memory > Paperclip 1.0 > Superpowers + ECC > ECC > Superpowers.**

Individual scores moved by up to one point between passes (judge noise). Raw and Superpowers + ai-memory held the top two in every pass. Superpowers + ai-memory placed above ECC every time, which settles that tie. Every attempt passed every gate and 21/21, and the reasons were consistent across passes:
- **Hard rules on shared files.** ECC and Superpowers edited auth's `auth.prisma` every time. Paperclip 1.0 avoided that file but added a SQL trigger on auth's `user` table, and it and Superpowers + ECC edited the base-owned `@domain/copy` barrel. Raw and Superpowers + ai-memory broke none.
- **Server test depth.** Raw, Superpowers + ai-memory, Superpowers + ECC and Paperclip 1.0 wrote HTTP-level specs; ECC and Superpowers stopped at unit level.
- **Concurrent edits.** Only Raw closed the PATCH year race. Superpowers + ai-memory writes only the fields sent (no lost updates). Superpowers + ECC rewrites the whole row.
- **Proportion.** The judge called the Superpowers-family plans (hundreds of KB of fully written code) close to "ceremony".

## Memory management, per approach

| Approach | How it keeps memory | Model calls spent on memory | Cost of that |
|---|---|---:|---|
| Paperclip 0.3 | `pc` ledger, written by the model | **153** | 20.9 agent-min · 1.09M fresh tokens · ~$8.61 (more fresh tokens than Raw's entire run) |
| Superpowers + ai-memory | hooks capture automatically; 23 MCP tools available | **0** | ~1.5k tokens of instructions per session; 389 observations captured for free |
| ECC | hooks: session files, cost metrics, continuous learning | **0** | runs in hooks. Separately, its GateGuard hook **blocked 75 of 388 tool calls (19%)** until the model restated the request and purpose, then retried |
| Superpowers + ECC | ECC's hooks alongside Superpowers' plan files | **0** | runs in hooks; GateGuard blocked only 7 of 787 tool calls (1%) |
| Paperclip 1.0 | ai-memory hooks + the company's `STATUS.md` / `decisions.md` | **6** | 2.3 agent-min · 30k fresh tokens · ~$0.67 (3.8%): the wake-up and the control-panel and decision writes; 414 observations captured for free |

## Paperclip 0.3 → 1.0

1.0 rewrote the company layer on this evidence:
- Roles became lenses of the main conversation, not spawned agents.
- `STATUS.md` became the control panel, drawn by `.paperclip/bin/panel`.
- `/build` routes work into Superpowers with the defaults measured here: inline execution, proportionate plans, ownership rules.
- ai-memory became the memory.

The run used exactly that: one wake-up call, Superpowers' brainstorming → plan → inline execution, and one final code review. The company also left a real control panel behind. It parked three decisions for the Founder, including the commit, which it didn't make on its own (the judge noted that three other runs committed despite the repo's no-commit rule).

| | Awake min | Fresh tokens | Cost | Company bookkeeping | Result |
|---|---:|---:|---:|---:|---|
| Paperclip 0.3 | 197.0+ | 5.71M | ≥ $57.77 | 153 calls · ~$8.61 | stopped at 9/11 slices |
| **Paperclip 1.0** | **40.3** | **758k** | **$17.83** | **6 calls · ~$0.67** | 7/7 · 21/21 · judge 4/4/5, 3rd of 6 |

**Next improvement, from the judge.** 1.0 avoided editing `auth.prisma` but reached into auth's table with a SQL trigger, and it edited a base-owned barrel. `COMPANY.md`'s ownership rule should name those cases explicitly. The panel's "no memory yet" in this run is an artifact of the benchmark's non-default ai-memory port.

## Why Superpowers + ECC took 127 minutes

Not ECC's gate (1% of calls), and not sleep: `bench.sh` now runs under `caffeinate`, and this run had 0 sleep, 0 stalls and 0 cut-offs. The difference is Superpowers' execution choice. This run used subagent-driven development, with **22 subagents** (mostly Sonnet) spending 2.23M fresh tokens in implementation. Both plain Superpowers runs executed inline. One run can't separate "ECC tipped the choice" from Superpowers' own run-to-run variance. The judge credited its verification (two review passes, 11 findings fixed).

## Sleep: what the stalls were

Raw, Superpowers and Superpowers + ai-memory ran while the machine was in use. ECC and part of Paperclip ran with the display off. The Mac, on AC power, then cycled all night through ~15 min of sleep and ~45 s of DarkWake, because nothing held a keep-awake assertion. Every "15-minute stall" in the transcripts lines up with a sleep interval to the minute: the mid-stream cut-offs and "API Error: Your computer went to sleep mid-response". **The stalls were not caused by the approaches.** An earlier note in this investigation blamed Paperclip's large outputs; that was wrong. `bench.sh` now runs under `caffeinate -i`.

Sleep does leave some residue that awake time can't remove. Retried responses cost extra tokens (ECC had 9 cut-offs, Paperclip 4). Commands left running across a sleep also hit timeouts: 2 of ECC's commands hit the 600 s limit. So ECC's and Paperclip's token counts are somewhat inflated, and their awake times are close but not exact.

## Reading it

- **Time:** Paperclip 1.0 (40.3), Superpowers + ai-memory, Raw, ECC and Superpowers are all within ~40–52 awake minutes, which one run each can't separate; run-to-run variance looks like ±10–20% (compare the two Superpowers plan phases: 435k vs 330k fresh tokens). Superpowers + ECC (126.7) and Paperclip (197+, unfinished) are clearly slower.
- **Tokens and cost:** Raw, Paperclip 1.0, Superpowers and Superpowers + ai-memory spent $17–19 each. ECC spent $24.83 (+30–45%), consistent with its gate retries and sleep-inflated retries. Superpowers + ECC spent $39.28 (22 subagents). Paperclip spent ≥ $57.77 at the stop.
- **Quality:** a tie on everything automated (gates, 21/21). Across three blind passes, Raw and Superpowers + ai-memory are the top two, with neither consistently ahead of the other. Paperclip 1.0 placed third in its only pass.
- **ai-memory's single-session overhead is about zero.** This run can't show its benefit, which is continuity across cold starts, machines and providers.
