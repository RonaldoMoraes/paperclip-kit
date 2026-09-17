# Writing a GritQL plugin

A `.grit` file is one rule: a header comment (the constraint, why, and which `biome.json`
scope carries it), `language js`, and a pattern that calls `register_diagnostic`.

```grit
// <What must stay true, and what breaks when it doesn't. Which scope in biome.json.>
language js

or {
  JsModuleSource() as $src,
  `require($src)`,
  `import($src)`
} where {
  $src <: r"^[\"'`]some-vendor(?:/.*)?[\"'`]$",
  not $filename <: r".*apps/server/src/vendor/providers/.*",
  register_diagnostic(span=$src, message="…what to do instead…", severity="error")
}
```

## Pitfalls that have bitten (each one produced a green lint over real violations)

- **Snippet import patterns match one shape only.** `` `import $x from $src` `` matches
  `import x from "y"` and nothing else — not `import { a, b } from "y"`, not
  `import * as x`. Match the module source node instead: `JsModuleSource() as $src`,
  and add `` `require($src)` `` and `` `import($src)` `` for the other two ways a module
  is named.
- **Regexes are full-match.** `r"^[\"']vendor[\"']$"` misses `"vendor/sub"`. A module
  regex needs a `(?:/.*)?` tail. Quote characters are part of the node text — include
  `[\"'`]` at both ends.
- **Exempt the sanctioned file with `$filename`.** `not $filename <: r".*/the/seam\.ts$"`
  — the regex runs against the absolute path, so anchor the tail, not the head.
- **Type-only imports are erased at build.** A boundary rule about runtime coupling must
  let `import type` / `export type` / `typeof import(...)` through:

  ```grit
  pattern erased_at_build() { r"^(?:(?:import|export)\s+type\b|typeof\s+import\b)[\s\S]*$" }
  …
  $s <: not within erased_at_build()
  ```
  or, on a `JsImport() as $stmt`, `$stmt <: not r"^import\s+type\b[\s\S]*$"`.
- **`or` short-circuits per node.** One string literal with three banned classes
  produces one diagnostic. A fixture that wants to prove three branches puts each
  violation in its own literal, and `canaries.json` sets `min` accordingly.
- **Member calls need their own alternatives.** `` `getByRole($...)` `` does not match
  `screen.getByRole(...)`. List `` `$_.getByRole($...)` `` too — `spec-guardrails.grit`
  carries the full list for exactly this reason.
- **`$...` is the argument wildcard**, `$_` an anonymous single node. `` `act($...)` ``
  matches any arity; `` `act($_)` `` exactly one argument.
- **A warn is a question.** `severity="warn"` fails nothing; it puts the line in front of
  its author. Use it when the fix is a decision; use `error` when it is a rewrite.

## Suppressions

`// biome-ignore lint/plugin/<grit file name>: <reason>` on the line above. A bare
`lint/plugin:` suppresses every plugin on that line; a name no file carries reports
`suppressions/unused`. The reason is the claim the line makes and why no rule-abiding
form exists — a reviewer reads it as an assertion, not an excuse. A whole file the rule
does not apply to is excluded with a `!` path in the override's `includes`, never with a
file full of ignores.

## Scoping in biome.json

`plugins` at the top applies everywhere `files.includes` allows. An `overrides` entry
scopes a plugin to `includes` globs with `!` exclusions; plugin lists accumulate across
every override a file matches. The `apps/server/**` override sets the parser and must
stay last — insert yours above it. Rule *options* (`noRestrictedImports` and friends) do
**not** merge across overlapping overrides: restate them in every override that needs
them.
