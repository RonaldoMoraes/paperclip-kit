# Changing the layering: a new edge, scope, or rule

Use this when a design under `apps/mobile` needs something a guard refuses today — a
route that must hold state, a screen that must read the navigator, a spec that must mock
past the seam, a shared component that has to be reachable from the phone. The guards
are a snapshot of the structure, not a veto: the right move is to change the structure
deliberately, in the same commit as the code that needs it, never to route around it (a
re-export, a file in the "wrong" directory, a `biome-ignore` with no reason).

## Where each rule lives

| The rule | The file | Its scope (`biome.json` override) |
| --- | --- | --- |
| A route holds no state, effect, reducer or runtime `@domain/` import | `biome/route-no-logic.grit` | `apps/mobile/app/**` minus `_layout.tsx` |
| A screen owns neither the status bar nor the navigator | `biome/screen-chrome.grit` | `apps/mobile/src/features/**/screens/**`, source only |
| A spec mocks the seam, never `~/features/*` or `@domain/*` | `biome/mock-seam.grit` | `apps/mobile/**/*.spec.*` |
| No web-only `@ui` module on the phone | `biome/mobile-ui-imports.grit` | `apps/mobile/**` |
| A tuned spring names its mass | `biome/spring-mass.grit` | `apps/mobile/**` |
| `EXPO_PUBLIC_*` is read in one place | `biome/expo-public-env.grit` | `apps/mobile/**` minus the four owners |
| A screen never reaches the network; a hook returns a narrow object | base `server-state-boundary.grit`, `hook-narrow-return.grit` | both apps' `screens/`, `components/`, `hooks/` |

Each has a canary: a fixture under `scripts/lint-canary/` that must trip it, checked by
`yarn lint:guards` (`scripts/check-lint-guards.mjs`, entries in `canaries.json`). A guard
whose fixture stops firing fails the gate — that is what keeps a rewritten pattern from
failing open.

## Procedure

1. Say the change in one sentence and why the structure should have it (what it keeps
   local, what it prevents). If the sentence needs "just this once", stop: the file
   belongs somewhere else, or the state belongs in a hook.
2. Edit the rule where it lives:
   - A **scope** change is the override's `includes` in `biome.json` (in a scaffolded
     tree; in the kit, the surface's `surface.json`). Exclusions are `!` globs; a file that
     may do what the rule forbids is named there, with the reason in the grit's header.
   - A **pattern** change is the `.grit`. Match on the node's own source with an anchored
     regex or on `JsImport()` + `JsModuleSource()` — never the `import $x from $src`
     snippet, which silently matches only single-specifier clauses.
   - A **new banned or allowed module** (a shared component that gained or lost a
     `.native` split) is one alternation in `mobile-ui-imports.grit`.
   - The diagnostic `message` names the allowed list — update it so the message stays
     true; the canary's `needle` is a fragment of it.
3. Make the code change.
4. Prove it: `yarn lint` (the whole tree is small enough to read), `yarn lint:guards`
   (every canary still fires), then write one file that should still be rejected, confirm
   the guard blocks it, and delete it.
5. `docs/mobile.md` describes the rules in words; update it when a rule's meaning
   changed, not for a scope tweak. `AGENTS.md` states the intent, not the edges.
6. The commit message carries the reason.
