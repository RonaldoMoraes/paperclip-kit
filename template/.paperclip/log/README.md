# log/ — append-only, machine-readable history

Two JSONL files. One JSON object per line, appended with a single write so parallel
agents cannot tear each other's lines. **Never rewrite or reorder a line.** A reader
that meets a malformed line skips it rather than failing.

## tasks.jsonl — one line per finished task

Written by `pc task done` and `pc task fail`. This is the only corpus `pc estimate`
reads, and the answer to "how long does this kind of work actually take?"

```json
{ "id": "w-0042-payments-stripe", "campaign": "c-0003-payments-wave",
  "class": "module-build", "role": "engineer", "model": "the-cheap-one",
  "status": "done", "started": "…", "ended": "…", "duration_s": 1560,
  "tokens": null, "tool_uses": 111, "gates_passed": ["typecheck","lint","test"],
  "findings_raised": 1 }
```

- `duration_s` — wall clock, `ended` − `started`. `null` when a task was closed without
  ever being started.
- `campaign` — the fan-out the task belonged to, or `null`. Copied from the task file.
- `model` — what it ran on, or `null`. Set with `--model` on `pc task new` (or at close,
  when you only know afterwards). This plus `tokens` is what turns "mechanical verification
  belongs on a cheap model" from an assertion into something `pc estimate` can show you.
- `tokens` / `tool_uses` — a CLI cannot measure these; they are `null` unless the caller
  passes `--tokens` / `--tool-uses` on `pc task done|fail`. Fill them when your harness
  knows them; leave them null rather than guessing — `pc estimate` says plainly when no row
  in the log carries a count, and blanks the column rather than inventing one.
- `gates_passed` — defaults to the task's declared `gates` on `done`, `[]` on `fail`.
  Override with `--gates-passed a,b`.
- `findings_raised` — findings whose `raised_by` is this task, counted at close.

### `class` is the estimate bucket

Estimates are only as good as the classes are consistent. Reuse a class name that exists
before inventing one. The ones in the seed data: `inventory`, `surface-build`,
`module-build`, `module-fix`, `doc-pass`, `engine-fix`, `matrix`.

### The shipped file is seed data, not a law

`tasks.jsonl` ships with 27 rows from **one** campaign (the kit v0.2 build — every row is
marked `"seed": true, "campaign": "kit-v0.2-build"`). It exists so `pc estimate` is useful
on day one instead of after your tenth task, and so `pc status` can show a running task
its class median from the start.

Those numbers describe that campaign on that model with that codebase. They are a
starting prior, not a commitment and not a benchmark. Your own rows accumulate beside
them and shift the median as they should. `pc estimate` prints how many samples are seed
so you can tell whose data you are looking at. Delete the seed rows whenever you have
enough of your own — nothing depends on them.

## events.jsonl — one line per mutation and notification

An audit trail: `{ "ts", "event", … }` where `event` is `task.new`, `task.start`,
`task.done`, `task.block`, `task.scope-overlap-forced`, `finding.new`, `finding.claim`,
`campaign.new`, `campaign.close`, `handoff`, `notify.blocked`, …
Nothing reads it automatically. It is there for the post-mortem after a campaign dies —
who did what, in what order, and whether the notification actually went out
(`"delivered": false` when it did not).

Writing to this file never fails a command.

## Reading it

`pc` is `.paperclip/bin/pc` — call it by that path if it is not on yours.

```
pc estimate                     # median, range, sample count and median tokens per class
pc estimate module-build        # one class; says so plainly when n < 3
pc estimate --json              # for a script (median_tokens, tokens_n, models per class)

tail -5 .paperclip/log/events.jsonl                          # what just happened
jq -r 'select(.class=="module-build") | .duration_s' .paperclip/log/tasks.jsonl
```
