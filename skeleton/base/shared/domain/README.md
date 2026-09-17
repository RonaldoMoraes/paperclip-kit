# shared/domain

The product's rules and words, computed and stated here and nowhere else, the same way on
web, mobile and server. A number two screens show, a sentence two platforms print, a
sequence of steps two renderers walk: one definition, or the two drift silently.

Rules — the same import discipline as `shared/contracts`:

- Plain data, types and pure functions. No React, no NestJS, no `fetch`, no imports from
  any app — this directory is imported by the web app, the Expo app and the server alike.
- A calculation lives here once; a screen renders its result and never re-derives it.
- Copy is data under keys, never string literals in a screen.

Imported as `@domain/*` from the web app, the Expo app and the server alike.

## Layout

- `copy.ts` + `<feature>/copy.ts` + `fill.ts` — the product's copy: per-feature modules
  under keys both platforms share, re-exported by the `copy.ts` barrel (`@domain/copy`);
  `fill()` fills the `{slots}`. A product with a design source for its copy keeps the
  export names and key paths identical to it, so one diff holds the two side by side.
  Emphasis marks (`*em*`, `**strong**`) are rendered by each app's own `withMarks`.
- `example/copy.ts`, `settings/copy.ts`, `shell/copy.ts` — the words of the three screens
  base ships.
- `shell/tabs.ts` — the shell's destinations: which there are, in which order, and the
  path each lives at. Labels are `SHELL_COPY.tabs`; icons are each platform's own.
- `flow/` — a multi-step flow as a pure state machine, with a two-question sample. Its
  README says what is contract and what is renderer.
