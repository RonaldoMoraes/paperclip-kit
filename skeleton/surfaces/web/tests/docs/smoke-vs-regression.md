# Contract vs smoke vs regression

Three web Playwright lanes. The same screen may have a file in each. Lane = folder =
project — CI selects by project, not by tag alone.

## Contract

Per routed screen, under `specs/web/contract/<journey>/`. Answers: the screen exists and
stands ready (seed / primary action / guard). Required by `yarn test:contract` (static file
presence) and run by `yarn test:web:contract`. Each journey's critical path keeps one
**keyboard-only** variant (Tab, Enter — locating by testid as ever), and state that must
survive a reload is asserted after `page.reload()` in the owning screen's spec.

Same POM + YAML + AAA as the other lanes — not a separate locator style.

## Smoke

Short and looks like real use: open the feature and **see what should be there** — title,
CTA, empty state, list. Non-happy paths are fine when they match real usage (empty, retry).

Folder: `specs/web/smoke`. Product smoke is optional per screen; it is not the 1↔1 gate.

## Regression

Broader coverage: multi-step combinations, action → response, extensive negatives. Same
POM/YAML; different scope. Folder: `specs/web/regression`.

## Not these lanes

Long wizards as the only coverage, pixel page-contracts, or "@smoke" / "@contract" tags
outside the matching folder.
