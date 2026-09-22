# Build harness — how engineering work flows

One rule behind everything here: **a wrong plan must cost about 20 minutes, never 2 hours.**
So no work runs unexamined for longer than one slice, and a plan is attacked before anyone
builds it. Strong-model tokens go where judgment is (planning, criticising, checkpoints,
small uncertain fixes); cheap-model tokens go where volume is (typing out a settled plan).

> **Validated on one build** (pilot 1: security hardening in legacy server code, ten slices,
> on an earlier stand-in of this ledger — see §10 for what it proved). A second pilot of a
> different shape (UI or feature work) is recommended before treating these defaults as
> settled. The numbers the Founder owns are in §9, **Founder policy** — the only place they
> are written; personas, blocks and commands point there.

`/campaign` is parallel breadth — many units against one contract. This harness is
sequential depth — one change whose plan must be proven, attacked and checkpointed. They
compose: independent slices of a build may fan out as a campaign wave, under the same
one-writer-per-file rule.

## 1. Triage — one question

> *Can I write the exact change and how to verify it in ~10 lines, right now, from what I
> already know?*

| Answer | Tier | What happens |
|---|---|---|
| Yes | **Direct** | Those ~10 lines are a **mini-order** (§5), sent straight to `engineer` (cheap model) through `/task`. One ledger task (`--class mini-order --role engineer`); no planner, no critic, no order file. |
| No, but it is small | **Guided** | `tech-lead` (strong model) does it itself (`--class guided --role tech-lead`), or probes first and then writes the mini-order. The CTO reviews what it wrote. |
| No, and it is big — or it touches a seam (§9), whatever its size | **Full** | The loop in §3 (`/build`). |

Certainty decides, not size: a rename across 200 files is Direct; five lines inside the
login adapter are not. **Escalation from below is always open:** an `engineer` who finds
that a Direct task is not what the order pictured returns at once with `STATUS: not micro`
and the reason, and the task is triaged again.

## 2. A build is a campaign

Nothing here is new machinery: a Full build runs on the ledger (`PLAYBOOK.md` › Running
work). `pc` is `.paperclip/bin/pc`.

| Harness | In the ledger |
|---|---|
| A build | a campaign: `pc campaign new "<build>: <title>" --contract .paperclip/orders/<build>.md --goal "True when done: … · Not doing: … · Could break: …"` — `<build>` is `<yyyymmdd>-<slug>` |
| The work order | `.paperclip/orders/<build>.md` — schema and template in `orders/README.md` |
| Plan, re-plan | task `--class plan --role tech-lead --scope .paperclip/orders/<build>.md` |
| Critique | task `--class critique --role critic`, no scope (the critic writes nothing — `pc` warns, as expected); the reply is saved verbatim as `orders/<build>.critique-<n>.md` |
| Probe | task `--class probe --role tech-lead`, no scope — ≤ 15 min, nothing durable |
| Slice | task `--class build-slice --role engineer --model <from the order> --scope <its allowed paths>… --gates <gate names>` |
| Checkpoint | task `--class checkpoint --role tech-lead --scope <the slice's allowed paths>` |
| Close review | task `--class review --role <the fresh reviewer>` |
| Close | task `--class close --role <the orchestrator>`; its done note is the tally (§7) |
| A surprise | `pc task note <slice-task> "surprise: <what the order implied> → <what the code does>"`, written by the executor when it happens |
| A discovery | `pc finding new --from <task> --area <path> --severity …` — filed, not listed |
| plan-gap / execution-gap | a finding whose title starts `[plan-gap]` or `[execution-gap]` (§7) |
| Pause escalated to the Founder | `pc task block <id> --on founder` + `pc notify blocked "<the question>"` |
| A proven assumption | `.paperclip/research/<topic>.md`, with its evidence |
| Build finished | `pc campaign close <c-id>` — refuses while a task is open or a finding its tasks raised is unresolved |

Every build task also carries `--campaign <c-id> --contract .paperclip/orders/<build>.md`
and `--model` = what it runs on.

**Sequence by creation, not by blocking.** `pc task block` takes a finding or `founder`,
never another task, so a slice's task is created when that slice is next to run — after the
checkpoint accepts the previous one, or beside it when pipelined (§3, step 5). The planned
sequence lives in the order and in the campaign file's `## Tasks`. This also keeps the scope
check honest: a later slice may rewrite a file an earlier, finished slice wrote, while two
live slices never share one.

**The harness measures itself.** Keep the class names above stable: `pc estimate plan`,
`critique`, `probe`, `build-slice`, `checkpoint` report what planning, attack and
checkpoints really cost, so "what does the critic cost?" is a number, not a guess. Pass
`--tokens` on `pc task done` wherever the count is visible.

## 3. The Full loop

0. **Goal card** — three fields on the campaign's `--goal`, written by the acting C-level
   and shown to the Founder in the kickoff message (not a blocking question): *true when
   done · not doing · what it could break*. No harness catches a wrong goal; this is the
   only guard.
1. **Plan** — `tech-lead` reads `.paperclip/research/` and the code and writes the work
   order. Every assumption it proves goes to `research/` with its evidence.
2. **Attack** — `critic` (fresh context) tries to break the plan, **on every Full build**:
   in pilot 1 its 24 objections over five passes were all real and none was refuted, and 4
   of the first 7 were plan-breaking where a green spec would not have caught them.
   `tech-lead` answers every objection: fix the order, or refute with evidence. The CTO
   arbitrates what is left, and approves any order that touches a seam.
3. **Probes** — every assumption the plan stands on that is still *unproven* becomes a
   probe: ≤ 15 minutes, changes nothing durable, answers one question. No slice task exists
   while a load-bearing assumption is unproven.
4. **Slices** — `engineer` executes one slice at a time, within the policy's slice size,
   ending green. The **first slice is the riskiest thing, cut thin and end to end**, and
   produces real evidence (a test that failed and now passes, a working endpoint, a
   screenshot) within the policy's first-evidence time; who approves it is policy.
   **Every slice's gates include a scoped typecheck** of each package it touched — test
   runners like vitest do not typecheck, and in pilot 1 a type error in a new spec rode
   unseen from slice 3 to the close and failed the first full run.
5. **Checkpoint after every slice** — `tech-lead` (resumed, same context) re-runs the
   slice's gates itself, typecheck included · checks the changed files against the slice
   task's scope · reads the diff · runs the existing specs of every symbol whose signature
   the slice changed, even when no gate names them · compares lint by message against the
   baseline · reads the executor's surprises · asks **"does the rest of the plan still
   hold?"** (in pilot 1 that question found three plan-gaps no gate could). Verdict:
   `CONTINUE` · `RE-PLAN` · `STOP`. Nobody checkpoints their own code: a change `tech-lead`
   makes itself is reviewed by the CTO.
   - **A slice in flight is never amended.** An order change lands before the slice starts
     or goes into the next one — the executor never sees an edit made while it works.
   - **Pipelining is allowed:** a slice whose allowed paths are disjoint from everything
     uncommitted may start while the previous slice's checkpoint runs. The checkpoint task
     holds the previous slice's paths while it runs, so `pc` refuses a pipelined slice that
     would touch them; the checkpoint stages its own files by explicit path, so the other
     slice's files never ride along. A critic pass on a changed part still clears before the
     slice that depends on it.
6. **Surprise rule** — at the policy's surprise limit the build pauses, even when
   everything is green. What a pause does — automatic re-plan or escalation — is policy.
   A re-plan is a new `plan` task (rewrite the affected slices) and a `critique` task on the
   changed part only.
7. **Close** — an independent review (`/code-review` or a fresh reviewer, with the order in
   hand, filing each finding tagged) · the real-client pass when the repo's rules ask for
   one · the full suite (at most twice per build: here and after the review's fixes — slice
   gates stay scoped and fast) · every finding fixed or closed with a reason · the tally
   (§7) · `pc campaign close` · `STATUS.md`. Long runs write their output to files on disk,
   so a cut-off (usage limits end agents mid-run) leaves evidence to read instead of a lost
   result.

Both `tech-lead` and `engineer` are **resumed** across the build (`SendMessage`), not
started cold each time: they keep what they have read.

Always on: the repo's hard rules, as its agent instructions (`AGENTS.md` / `CLAUDE.md`)
state them — no `git add`/`commit`/`push`/branch unless the Founder asks (the only
exception is the undo grant in §8), lint and test only the package changed, the repo's
migration rule, the order's do-not-touch zones. Anything irreversible or outward-facing
still goes to the Founder first, whatever the tier.

## 4. The work order

One per build, at `.paperclip/orders/<build>.md`. The template — goal, worktree
prerequisites, what the executor must know with the proven gate table, closed decisions,
assumptions, allowed paths and do-not-touch zones, slices, surfaces, out of scope — and its
rules live in [`orders/README.md`](orders/README.md), and only there.

## 5. The mini-order (Direct tier)

`Change · Why · Verify · Stop if` — the **Mini-order** block in
[`briefs/_blocks.md`](briefs/_blocks.md), composed with the blocks
[`briefs/README.md`](briefs/README.md) lists for a Direct brief.

## 6. What the executor hands back

Every slice and every mini-order hands back in the **Report** block's shape
(`briefs/_blocks.md`): `STATUS` first, then steps, gates with their output, red→green,
surprises, the findings filed, files, what is left.

## 7. How the harness learns

Every problem found after the order was written — at a checkpoint or in the close review —
is tagged: **plan-gap** (the order was silent or wrong) or **execution-gap** (the order was
right, the executor strayed). Plan-gaps fix `tech-lead`, `critic` or the order template;
execution-gaps fix `engineer`, the order's level of detail, or the model routing. If
execution-gaps dominate, the executor's model or effort is wrong — fix it and re-pilot.

v0.3.0 records all of it with conventions over the existing CLI (dedicated commands are a
follow-up, listed in the kit's `UPGRADE.md`):

```
C=<campaign-id>
TASKS=$(grep -l "^campaign: $C\$" .paperclip/work/*.md)
grep -c 'surprise:' $TASKS                                   # surprises per task
for t in $TASKS; do grep -l "^raised_by: $(basename "$t" .md)\$" .paperclip/findings/*.md; done \
  | xargs grep -h '^title:' | grep -o '\[[a-z]*-gap\]' | sort | uniq -c   # plan-gap vs execution-gap
.paperclip/bin/pc estimate                                   # what each class really cost
```

The **tally** is the close task's done note, one line: slices planned / executed /
re-planned · surprises per slice · pauses · re-plans automatic / escalated · critic
objections total / real / refuted · probes run / proved false · checkpoint verdicts ·
plan-gaps / execution-gaps · executor models · **one thing to change** in a persona, the
template or the policy. The Founder decides on that change; the next build runs with it.

## 8. Where the code is written, the ledger, and undo

- **Use the repo's worktree flow if it has one; otherwise ask the Founder where the code is
  written.** Cutting a branch or worktree is the Founder's go, asked once per build — in the
  same question as the undo policy (§9). Then the session enters the worktree
  (`EnterWorktree` with its `path`) so every agent works *from inside* it.
- **The ledger and the order stay in the primary checkout.** `.paperclip/` is git-excluded,
  so a worktree has none, and every prompt names the order by **absolute path**. `pc` finds
  its ledger by walking up from the current directory, so from a worktree it is called as
  `PAPERCLIP_DIR=<primary>/.paperclip <primary>/.paperclip/bin/pc …` — that string fills the
  `<pc>` slot of the brief blocks.
- **Unproven on `pc`, so probed first.** Pilot 1 (on stand-ins) found that a session inside
  a worktree could not write the primary checkout; it copied its build folder into the
  worktree and back at the close. Right after entering the worktree, before slice 1, run one
  `pc task note` and one edit to the order from inside it. If either is refused, widen the
  session with `/add-dir <primary>/.paperclip` (Claude Code's way to add a directory; untested
  against the worktree guard) and retry. If it is still refused, fall back to pilot 1's way:
  copy the order into the worktree's own `.paperclip/orders/` (git-excluded there too through
  the shared exclude file), keep the ledger calls owed in a progress file beside it, copy the
  order back and replay the calls into `pc` from the primary checkout at the close — and say
  in the close note that those durations were replayed. Write which way worked to
  `.paperclip/research/` so the next build does not probe again.
- Inside a worktree the isolation guard refused compound shell commands that mention git:
  keep git commands plain and separate, in agent prompts too.
- **Undo, under the grant (§9):** one local commit per accepted slice, inside the build's
  own worktree, made by `tech-lead` at the checkpoint and only on `CONTINUE` — on the
  build's branch (never the trunk, production or a release branch), staged by explicit path
  (never `git add -A` / `.`), in the repo's commit convention, tests riding with the code.
  The `engineer` never touches git. The grant covers nothing else: **no push, no PR, no
  merge, no rebase, no commit in the primary checkout** without a fresh go. A rejected slice
  is undone with `git restore` / `git clean` on that slice's paths only, inside the
  worktree, after looking at what is there.
- **Undo, without the grant:** `tech-lead` saves a snapshot per accepted slice
  (`git diff -- <its paths>` plus a copy of each new file, in `orders/<build>.snapshots/`);
  a rejected slice is reversed from its snapshot, on its own paths only.

## 9. Founder policy — editable defaults

Edit this table; it is the only place these values are written.

| Knob | Default | Other options |
|---|---|---|
| Who approves first-slice evidence | the acting C-level (normally the CTO) — the Founder is not interrupted for it | the Founder |
| What a pause does | the first re-plans automatically (plan → critic on the changed part → continue) and is reported to the Founder afterwards; a second pause on the same build stops and escalates to the Founder | always ask · never re-plan automatically |
| Surprise limit | 3 surprises in one slice, or 1 that touches a closed decision | any count |
| Slice size / first evidence | ≤ ~30 min of executor work / ≤ ~20 min after slice 1 starts | — |
| Models and effort | set in frontmatter: `engineer` `sonnet` / `high` · `tech-lead` inherited / `xhigh` · `critic` inherited / `high`; hard slices (subtle auth, concurrency, money) are named in the order for a stronger executor, through the per-call model override | lower `tech-lead` to `high` to save tokens (the effect of `effort` is unverified, §10) |
| Undo between slices | ask once per build, with the branch/worktree go, for the local slice-commit grant (§8) | patch snapshots (§8) — the answer when the grant is declined |
| Seams that force the Full tier | auth · billing · database schema · shared contracts · deploys | edit the list |
| Full suite | at the close only, at most twice per build | — |
| Ticket required | no — the harness never needs one (the repo's branch naming may) | — |

Not a knob: anything irreversible or outward-facing goes to the Founder first, whatever the
tier.

## 10. Claude Code facts this relies on — and how sure we are

Checked on 2026-09-21 (docs read, and pilot 1 in a real install). Re-check after a Claude
Code upgrade; correct this list when one stops holding.

- **Agent frontmatter `model`, `effort` (low · medium · high · xhigh · max),
  `disallowedTools`, `tools`, `color`** — official sub-agent docs. `disallowedTools`
  confirmed live (the session listed `critic` as "All tools except Edit, Write,
  NotebookEdit, Agent"). `effort` is accepted; its effect is **unverified**.
- **Subagents can spawn subagents** unless `Agent` is disallowed (docs) — hence the
  executor's and the critic's deny-list.
- **Resume:** `SendMessage` to a finished agent resumes it from its transcript. **Confirmed
  in pilot 1:** `tech-lead` ~20 resumes, engineers 5–7 each, `critic` 5; a resumed agent
  followed the session into the worktree; resume survived a usage-limit cut-off and a model
  switch.
- **Per-call model override** on the Agent tool (`sonnet | opus | haiku | …`, "takes
  precedence over the frontmatter"; public docs silent). Pilot 1: `model: opus` was accepted
  for the `sonnet`-pinned engineer; which model actually ran is not visible — **accepted,
  not verified**.
- **Hot reload, as observed:** a new `.claude/commands/*.md` showed up in the same session
  at once. New agent files were refused as `Agent type … not found` in the turn they were
  written, then listed on the next user turn. Whether *edits* to an already-loaded agent
  reload without a restart is unknown → **reload the session after changing a persona.**
- **Worktrees:** `EnterWorktree` with `path` moves the session into an existing worktree
  from `git worktree list`. Git-excluded files (`.paperclip/`, local personas) do not exist
  inside a worktree → prompts carry absolute paths. **Pilot 1:** a session inside a worktree
  could not write the primary checkout, and its guard refused compound shell commands that
  mention git (§8). The docs mention `.worktreeinclude` for copying ignored files into
  Claude-made worktrees — untested.
- **Cut-offs:** when a subagent was cut off by a usage limit, the background suite run it
  had just started still completed and its output was on disk — hence "long runs write
  their output to files".
- **Deferred on purpose:** a `SubagentStop` hook (docs) could re-run gates automatically
  when the executor stops; the Workflow tool could run the slice loop deterministically but
  needs the user's opt-in on every run and cannot pause mid-run for an approval. This
  harness runs from the main thread.
