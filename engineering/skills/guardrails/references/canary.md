# The canary

`yarn lint:guards` (`scripts/check-lint-guards.mjs`) proves every plugin is **wired** and
**alive**. A dead guard is worse than none — its rule fails open with zero diagnostics and
nobody notices until the boundary it protected is gone.

## What it checks

1. **Wiring.** Every `biome/*.grit` on disk is referenced from `biome.json` (`plugins` or
   an `overrides[].plugins`); every reference exists; every wired plugin has an entry in
   `scripts/lint-canary/canaries.json`; every entry's fixture exists.
2. **Firing.** Each fixture is copied to its `dest` — a path inside the plugin's scope —
   then one `biome lint --reporter=json` runs over all of them under the real config.
   Diagnostics with `category === "plugin"` are matched per dest; each `needle` must
   appear at least `min` times. A "loading of plugins" / "Failed to compile" diagnostic
   is a wiring failure. Copies are removed in `finally`, including any transient
   `__lint-canary__` directory.

## Writing an entry

```json
{
  "plugin": "biome/hook-narrow-return.grit",
  "fixture": "hook-narrow-return.fixture.ts",
  "dest": "apps/web/src/features/__lint-canary__/hooks/useLintCanary.ts",
  "expect": [{ "needle": "Return only what the view reads", "min": 1 }]
}
```

- `dest` must contain `__lint-canary__` (so a stale copy is recognisable and fails
  `yarn lint` loudly) and must sit **inside the plugin's override scope** — a rule scoped
  to `features/**/hooks/**` needs a dest under such a directory; the script creates and
  removes it.
- `needle` is a fragment of the diagnostic message. Avoid quoting the banned token
  itself when the canary file is linted by the same rule (a string literal containing a
  banned class would trip the guard on `canaries.json`'s neighbours).
- `min > 1` when one fixture deliberately holds several distinct violations of the same
  rule — say why in the fixture's header comment.
- The fixture is excluded from the normal lint (`files.includes: "!scripts/lint-canary"`),
  so it may be as wrong as it needs to be. Keep it minimal: one violation per branch you
  want proven, nothing else.

## In a module

`module.json` → `canaries: [ { plugin, fixture, dest, expect } ]` and the fixture under
`files/scripts/lint-canary/`. The scaffold merges the entries; the gate in the generated
tree proves them. A module must pass `yarn lint:guards` alone on base and together with
every other module.
