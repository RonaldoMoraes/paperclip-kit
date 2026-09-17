# research/ — what an agent learned, kept for the next one

Durable notes from reading: how an existing system actually works, what an API really
returns, which of three options survives contact with the codebase. Written once, read
many times, by agents that were not there when it was written.

This is the "read the repo so nobody has to read it again" pile. It is not a defect
tracker (`../findings/`), not a plan (`../work/`), and not a decision (`../decisions.md`).

## File name

`.paperclip/research/<topic>.md` — a plain kebab-case topic, no sequence number. One
file per topic; update it in place when you learn more rather than starting `-v2`.
Examples: `inventory-server-contracts.md`, `stripe-webhook-semantics.md`,
`expo-ota-constraints.md`.

## Schema

Frontmatter is optional but cheap, and it is what makes a file findable a month later:

```
---
topic: stripe-webhook-semantics
by: w-0042-payments-stripe          # the task that produced it (or an agent id)
date: <iso8601>
sources:                            # files read, docs fetched, commands run
  - packages/server/src/payments/**
  - https://docs.stripe.com/webhooks
confidence: high | medium | low
---
## Question
What was actually being asked.

## Answer
The short version, first. Somebody will read only this.

## Evidence
Verbatim excerpts, file paths with line numbers, command output.

## What this means for us
The consequence for the build — the part that changes what someone does.
```

## Rules

- **Answer first.** The next agent reads three lines and moves on; do not make it earn
  the conclusion.
- **Cite the source.** A file path, a line number, a URL, a pasted command. Research
  with no evidence is an opinion, and an opinion belongs in a decision, not here.
- **Say your confidence, and say what you did not check.** "I did not test this against
  the live API" is more useful than a confident wrong answer.
- **Supersede in place.** When something here turns out to be wrong, edit it and note the
  correction at the top — do not leave two files disagreeing.
- **Findings graduate out of here.** If what you learned is that something is *broken*,
  it is a finding: `pc finding new`. This directory is for how things *are*.

`pc` does not write this directory — agents do. `pc handoff` points a cold session at it.
