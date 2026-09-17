# shared/domain/flow

A multi-step flow — an onboarding, a questionnaire, a setup wizard — defined once as
business logic with no UI in it, and rendered by each platform.

## What is contract and what is renderer

**Contract** (this directory, pure): which steps exist and in what order, every branch,
every question's copy and options, the step ids a deep link or an analytics event may
name, the bar's label and enabled state, the counter, and what the walk produces.

**Renderer** (per app, `features/<flow>/hooks/use<Flow>.ts` + screens): the components
each step kind draws, layout and type, the beat between a tap and the next question,
scrolling, animation, routes, and where a draft is stored. A renderer is `useReducer`
over `reduceFlow`, plus the platform's timers and navigation, and nothing else — the
guards under `biome/` fail a screen that holds flow logic of its own.

## The engine

`flow.ts`:

- `FlowItem` — the union a renderer switches on: `select`, `multi`, `narrative`. Every
  item carries a step with an `id`; `idOf(item)` is what tags, deep links and
  `stepIndex` key on.
- `buildItems(state)` — the list for a state, rebuilt on every read, so a decision that
  changes the list moves every later step. Never cache it across an action.
- `FLOW_STEPS` / `isFlowStep` / `stepIndex(items, step)` — deep links: a route's search
  schema validates against the list, and a link resolves by id against the items the
  state builds. Answers before the linked step are never invented.
- `FlowState` / `FlowAction` / `reduceFlow` — the reducer. `picked` is the latch that
  makes a second tap during the auto-advance beat the same answer, not a new one.
- `viewOf(state)` — `{ item, progress, position, total, tag, bar }`, everything a screen
  draws. The tag names the step, not the route.
- `finishFlow(state)` — what the walk produces; the submit payload is built on it.

`steps.ts` holds the step shapes (`SelectStep`, `MultiStep`, `NarrativeStep`).
`sample.ts` holds the sample's steps: two questions and a closing screen, where the second
question's options follow the first answer and one answer skips it.

## Making a real flow

Copy this directory to `shared/domain/<flow>/`, replace `sample.ts` with the real steps,
and rewrite the two product functions in `flow.ts` — `buildItems` and `finishFlow` — plus
`FLOW_STEPS`. The reducer, the view and the deep-link resolution stay as they are; the
spec beside them is the template for the new flow's own.
