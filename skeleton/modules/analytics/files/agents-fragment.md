- **A screen ships its events.** A new or refactored screen proposes, in one line each,
  its **success** (`action` — the behavior that means the screen did its job), **funnel**
  (`funnel` — enter, complete, abandon), **choice** (`choice` — what the user decided, as
  a closed id) and **friction** (`friction` — retry, validation, backout) events, drawn
  from `shared/contracts/analytics/events.ts`; the developer strikes what they don't
  want, and the rest is wired before the screen is done. `screen-viewed` is automatic
  (the route's pattern, on both apps) and is never added by hand. A new screen whose
  feature has no `track(` gets the advisory reminder from `.claude/hooks/analytics-reminder.sh`;
  `yarn analytics:coverage` reports the whole tree, and gates nothing.
- **An event is a branch of the closed union, PHI-safe by construction.** Every field is
  a closed enum, a number or a `slug` id — never `z.string()` free text, never an answer,
  a message, a score or anything the user typed. A new event is a branch in
  `shared/contracts/analytics/events.ts` and one line in its `events.spec.ts` catalog; the
  server parses every batch with the same schema and refuses the rest.
- **Tracking is `useAnalytics().track(event)` at the transport edge** — a feature hook or
  the route, a screen only for a tap it owns. Nothing else posts to
  `/api/analytics/events`, holds an SDK, or reads the anonymous id: the queue batches,
  retries and flushes on its own, and `~/data/analytics` owns the id.
- **The server injects `ANALYTICS_CLIENT` and never a store.** `mongodb` is imported only
  under `apps/server/src/analytics/providers/` (`biome/analytics-provider-imports.grit`
  errors on the rest). `userId` comes from the resolved session, never from a body.
  `ANALYTICS_MODE=fake` is the default and stores nothing; `real` is asked for by name.
