# __PRODUCT_NAME__

<!-- One paragraph, kept current: what the product is, who uses it, what they do with it. -->
__PRODUCT_NAME__: a NestJS server (`apps/server`), a React/Vite web app (`apps/web`) and an
Expo app (`apps/mobile`) — the surfaces this product ships with — over `shared/ui` (the
design system), `shared/domain` (rules and copy, computed once) and `shared/contracts`
(the API as every app sees it). The user is the person this product serves; what they do
here is described in [`docs/architecture.md`](docs/architecture.md). One product per repo,
built standalone — its own CI, Docker context and deploy; shared code never imports from
an app, and every dependency lives in the workspace that uses it.

This file is the rules that hold on every edit. How the product works is in
[`docs/`](docs/README.md); commands are in `package.json`; the structure is the tree.
The code is the source of truth. Everything outside **Hard rules** is a default — if a
rule fights the task, say so and get the developer's sign-off.

## Read when you touch it

How the product works is in [`docs/`](docs/README.md): `architecture.md` for the shape,
`glossary.md` for the product words, `web.md` / `mobile.md` / `server.md` / `ui.md` for
the app you are editing, `checks.md` for a gate whose diagnostic is not enough,
`worktrees.md` and `branching.md` for how work moves. Read the one you need when you need
it; do not read them all up front.

## What belongs where

Before adding a line to this file, ask: can a check enforce it (write the Biome rule or
guard instead)? Can an agent read it from the code (leave it there)? Is it the story of
a decision rather than the rule that stands (it belongs in the PR)? Does it describe how
something works rather than what must not be broken (it belongs in `docs/`)? Is it a
procedure (it belongs in the skill)? Any yes — not here. `docs/` is written in the
present tense and changes with the code it describes.

## A small glossary

- **you** — the agent reading this. **The developer** — the person directing you.
  **The user** — the person using __PRODUCT_NAME__.
- **Feature** — a folder under `src/features/` on web or mobile, with the matching
  `shared/contracts/<feature>/` and `apps/server/src/<feature>/`. Same name in every layer.
  `example` is the reference feature: what every layer looks like when it is done.
- **Contract** — one endpoint's module in `shared/contracts/`; its **mock** is the
  `.mock.ts` beside it; its **fixture** is that mock's default response.
- **Mock mode** — every `/api` call answered by the mocks, no server (`yarn dev:mock`,
  `yarn mobile:mock`). **Real mode** — against `apps/server`.
- **Screen** — a `.tsx` under a `screens/` directory: takes props, renders. **Route** —
  what mounts it and loads what it needs.
- **Screen spec** — a web screen's Playwright contract file under
  `tests/specs/web/contract/<journey>/`, one test per screen state. **The testing
  contract** — the rules `scripts/check-test-contract.mjs` enforces.
- **Port** — an interface the server calls (`notification`, `analytics`, `telemetry`)
  with a console or no-op default; a module provides the real one.

## How we work

Agents write the code; developers orchestrate. Work in small steps the developer can see
and undo — a change that can be thrown away in a minute beats a large design that has to
be lived with.

**Sharing is a decision, not a default.** Two apps, built separately for the best web
experience and the best mobile experience. When something could be built directly in one
app or shaped to be shared (web, mobile, server), do not decide alone: state the two
options with their cost and ask. Some things are one-platform on purpose — a checkout
that is a web page on the web and a store sheet on the phone. Some things are shared on
purpose — a sign-in that is the same flow on every platform, so its contracts and mocks
live in `shared/`; a multi-step flow that is one definition in `shared/domain` — steps,
branching, rules, copy — with a renderer per platform that holds components and layout
and nothing else. The developer knows which is which; the agent's job is to make the
choice visible early, before the code assumes an answer.

Build the screen against the mock first, with no server running; the server implements
the contract afterwards. Prove the work runs where it ships — web, iOS, Android — before
calling it done.

**A comment names a live constraint** — what must stay true and what breaks if it
doesn't — in one or two sentences, beside the code it constrains. What was tried, what
broke, and how the decision was reached go in the PR; a constraint that no longer holds
is deleted, not rewritten as "now". Code that needs a paragraph to be understood is
restructured first.

Everything here is a default. If a rule fights the task, say so and let the developer
decide.

## Hard rules

- **No `git add`, `git commit`, `git push`, and no creating or switching branches, unless
  the developer explicitly asks.** Work stays local and uncommitted on the current branch.
- **Branches are cut from `__TRUNK__`**, never from `main` — `main` is production and
  behind `__TRUNK__`. Worktrees go through `yarn wt`; work in a worktree from inside it,
  never via `cd <worktree> && …` from the primary checkout.
- **An endpoint exists once**, as its contract module with the mock beside it. Nothing
  else describes the API — not a second schema, not a hand-written fixture.
- **Shared code never imports from an app.** `shared/contracts` has no React, no NestJS,
  no `fetch`; `shared/ui` takes at most type-only imports from `apps/web`.
- **Generated files are not edited by hand.** `apps/web/src/app/routeTree.gen.ts` is
  written by the router plugin from the route files; every `*.gen.ts` / `*.gen.tsx` is
  written by the kit scaffold from the manifest (the write-time guard refuses both).
- **Secrets.** `.env` holds real credentials. Read logs, not `.env`; when a check needs a
  secret's value, hand that check to the developer.
- **Lint and test the tree you changed, package-scoped.** Every gate is a root
  `package.json` script; run it from the root of this product, never from a parent.
<!-- kit:module-rules -->

## Hit every surface

The most common defect in a two-app product is a change that works where it was tested
and is missing — or silently different — everywhere else. Before calling work done, walk
this list and say which entries applied and which were deliberately skipped:

- **Platforms.** Web, iOS, Android. A feature is web-only or mobile-only by decision (see
  *How we work*), never by omission — name the decision.
- **Modes.** Mock and real. A screen that works only against the mock has a contract the
  server doesn't honor; one that works only against the server has a mock nobody updated.
- **The endpoint's three homes.** Contract schema, its mock, and the server controller
  that `parse`s with it. Change one, check the other two — the e2e suite answers from the
  mock itself, so a drifted mock is a drifted suite.
- **Screen spec.** A new or changed web screen state is a test in that screen's
  `tests/specs/web/contract/<journey>/<kebab-name>.spec.ts`, or it isn't tested.
- **Copy.** Every user-facing string lives in the domain copy layer
  (`shared/domain/<feature>/copy.ts`, read through `@domain/copy`) — never hardcoded in a
  screen or component. Interpolation is `fill()`'s `{placeholder}`; `*em*`/`**strong**`
  marks render through `withMarks()`. When a design source of truth names the strings,
  its keys are the keys here.
- **Analytics** (when the analytics module is present). A new or refactored screen
  ships with its events: **success** (what user behavior means the screen did its job),
  **funnel** (enter, complete, abandon), **choice** (what the user decides, as a closed
  enum), **friction** (retries, validation failures, backouts). Propose the list in one
  line each and wire it; the developer strikes what they don't want. Never free text,
  answers or message content in an event.
- **Auth on both transports** (when the auth module is present). Web sends the cookie
  jar; mobile sends the `Cookie` header from secure storage. An endpoint that reads the
  session must be tried from both.

## Verifying

Proof is proportional to the change. Every change owes the first line; the rest only
when its condition holds. Say which applied.

- Always: the specs you touched, `yarn lint`, `yarn typecheck`, `yarn test:contract`.
- A behavior added or changed: a test that fails when it breaks (see below). That test,
  not a manual walk, is what protects it from the next change.
- A new or changed web screen state: its screen spec, run through `yarn test:e2e`
  (hermetic — every `/api` call mocked). Two behaviors only e2e can guard: a journey's
  critical path keeps one **keyboard-only** variant (Tab, Enter — locating by testid
  as ever), and state that must survive a reload — the store — gets a `page.reload()`
  assertion in the owning screen's spec.
- A user-visible change that tests cannot see (layout, native behavior, a flow across
  screens): one pass in a real client, on the platform(s) the change ships to — web in
  mock mode through the browser tools, mobile on the simulator (`yarn mobile:mock`; JS
  reload, no native build unless native code changed). A screenshot goes in the PR's
  Evidence section through `yarn wt publish --attach` (files under the worktree's
  `.wt/evidence/`), never in the repo. A copy or spacing fix a spec already covers owes
  no device pass.
- A server change: one real-mode run of the endpoint, from both transports if it reads
  the session. The mock proves only the client half.
- The gates are mechanical — you will be told; don't memorize them. Run them and read
  the diagnostic; [`docs/checks.md`](docs/checks.md) has the full list.

**What a test is for.** A test guards a behavior a user or another module depends on.
Before keeping one, ask: *if the logic behind this were broken, would this test fail?* If
breaking the code would not fail it, or only a visual detail (a color, a padding, a class
name) would, it is not a test — delete it. Scaffolding, a static screen, a literal prop, a
config constant: no spec — the test arrives with the behavior. Each test names one claim:
not a literal restated, not a mock's return echoed, not a claim another test in the file
already forces, and a name that overclaims what it drives is rewritten or deleted.
Coverage is not a goal; a screen with three tests that would each catch a real regression
is better covered than one with thirty that pass no matter what. Prefer testing through
what the user sees and does over implementation details.

The layers say where a test belongs. Screen = pixels, props in and testIDs out; route =
dispatch; hook = glue at the transport edge; plain function = decision logic, tested
without mocks. A hook spec that mocks more than the transport is a layering finding:
extract first, then test what is left — or nothing, if only plumbing is left. Mocks stop
at the transport seam (auth client, `fetch`, `Linking`, timers).

e2e and the device loop own testID presence; a unit spec does not re-assert it, nor any
attribute incidental to the claim it makes. It does assert an accessible name where that
name is the claim — a primitive whose contract is its accessibility semantics. A spec
queries by testID, reserving a role or text query for an element that cannot carry one:
`spec-guardrails.grit` errors on the rest. It enforces the other mechanics too, and an
`act()` that survives it carries a `// biome-ignore lint/plugin:` naming the update no
interaction and no `waitFor`-able change drives.

## The ways to hurt the machine

1. **Killing by pattern.** Never `pkill -f`, `pgrep | kill`, or kill a PID found by
   matching a name or path — this machine runs other dev servers, other worktrees, and
   the agent's own process. Kill only a PID captured when the process was started, or the
   owner of a port after confirming it is yours.
2. **Ports and servers you did not start.** `:3000`, `:5173` and `:8300` (Metro) may
   belong to another session. If a port is taken, do not kill its owner — use another
   port and say so.
3. **Stop what you started.** Dev server, Metro, emulator, simulator, browser — shut it
   down when the work no longer needs it, by the PID you tracked.
4. **Paid or irreversible actions need per-instance approval.** A cloud build, a store
   submission, a deploy, a migration against a shared database, a message to a real
   inbox — never run one without the developer approving that specific action in the
   current conversation. "We'll need one eventually" is not approval. Inspecting is free.
