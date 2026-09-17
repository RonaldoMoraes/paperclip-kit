# contracts/ — the seams parallel agents build against

A contract is the agreed shape of a boundary between two pieces of work that are being
built at the same time by agents that cannot see each other. It is written **before**
either side is built, and neither side changes it alone.

This is the single highest-leverage file type in a parallel campaign: eight agents can
work simultaneously only because each one can read what the others will hand it.

## File name

`.paperclip/contracts/<name>.md` — kebab-case, named for the seam, not the feature:
`module-port.md`, `auth-session.md`, `analytics-events.md`, `llm-gateway.md`.

A task points at one with `contract:` in its frontmatter
(`pc task new … --contract .paperclip/contracts/module-port.md`).

## Schema

```
---
name: module-port
version: 1                      # bump on any breaking change
owner_area: skeleton/kit-core   # the path that owns this seam
consumers:                      # who builds against it
  - skeleton/modules/**
status: draft | agreed | frozen
---
## The shape
The interface itself — types, signatures, event names, wire format. Copy-pasteable.

## Rules
What a correct implementation must and must not do.

## Example
One complete, working use. Agents copy this.

## Open questions
Anything not yet settled — with who has to settle it.
```

## Rules

- **Write it before the code.** A contract agreed after the fact is a description, and
  descriptions do not prevent the defect this directory exists to prevent.
- **The shape section is copy-pasteable.** Real type signatures, real names. Prose about
  an interface is not an interface.
- **`status: agreed` means nobody edits it alone.** A change to an agreed contract breaks
  someone else's in-flight work: raise a finding against `owner_area` and let the owner
  make the change, or take it to the Founder. `frozen` means it shipped — treat a change
  as a breaking change with a version bump.
- **One seam per file.** If you cannot name the two sides, it is not a contract.
- **Open questions are named, not implied.** Every one says who decides.

## Why `pc handoff` quotes these in full

A handoff brief inlines every contract file verbatim, because the whole point is that a
different model or a different provider can resume the campaign with that one file and
the repository. A contract that lives only in a conversation is exactly the state that
does not survive a rate limit.
