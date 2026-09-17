/**
 * `@domain/copy` — the one-place view of the product's copy. Every feature's words live
 * in the feature that owns them (`shared/domain/<feature>/copy.ts`) and are re-exported
 * here, so a screen reads `@domain/copy` and a reviewer reads one import graph — without
 * a single huge file every lane would merge-conflict on.
 *
 * Keys are what web and mobile share; a product with a design source for its copy keeps
 * the export names and key paths identical to it, so one diff holds the two side by side.
 */

export { EXAMPLE_COPY } from "./example/copy";
export { fill } from "./fill";
export { SETTINGS_COPY } from "./settings/copy";
export { SHELL_COPY } from "./shell/copy";
