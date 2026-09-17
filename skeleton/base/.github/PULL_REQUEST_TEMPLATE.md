## What

<!-- What this change does, in a sentence or two. -->

## Why

<!-- The problem it solves, or the ticket it closes. -->

## How to test

<!-- The steps a reviewer follows to see it work: route, account, seed data,
     mock-mode state, anything they cannot guess. -->

## Evidence

<!-- What it looks like working: screenshots or a recording of the change on the
     platforms it ships to. `yarn wt publish --attach <file>` uploads them. -->

## Risks

<!-- What could break, what to watch after the deploy, and how to roll back.
     "None" is a valid answer when it really is. -->

## Checklist

- [ ] Validated in my environment — behaviour and visuals against the design source of truth
- [ ] `__TRUNK__` merged in
- [ ] Every surface walked (platforms, modes, the endpoint's three homes, screen spec, copy) — see `AGENTS.md`
- [ ] New dependencies are in the `package.json` of the workspace that uses them
