# Creating shared code

## Inside `shared/` (the default)

Nothing to scaffold. Shared code is three flat trees, each with one job, each reached by
alias — the aliases are identical in web, mobile, server, tests and vitest:

| Tree | Alias | Holds | Never holds |
| --- | --- | --- | --- |
| `shared/contracts/<feature>/` | `@contracts/*` | One module per endpoint (Zod schemas, path, query helper), its `.mock.ts` beside it, `errors.ts` | React, NestJS, `fetch`, a second schema for an existing endpoint |
| `shared/domain/<feature>/` | `@domain/*` | Rules, derivations, copy (`copy.ts`), flow definitions — pure functions, computed once for every app | I/O, framework imports |
| `shared/ui/` | `@ui/*` | Tokens, primitives (`Button`, `Button.native`), motion tokens, `cn()` | Runtime imports from `~/` (a design system that imports the app cannot be rendered bare) |

Copy the `example` feature's shape for a new feature: `shared/contracts/example/` shows
the contract + mock + fixture pattern, `shared/domain/example/copy.ts` the copy module.
`/feature <name>` clones it across every layer.

Rules that hold on every file here:

- Files inside a tree import each other by relative path, never through their own alias.
- A `.native.tsx` beside a `.tsx` in `shared/ui` is the mobile rendering of the same
  primitive with the same props; mobile resolves it first.
- A new `shared/*` file arrives with the spec that would fail if it were wrong — or with
  no spec, when it is a literal (a copy table, a token list). Never a mount-only spec.

## A new workspace package

Do this when a second product, a publishable library, or a genuinely separate build
(`db/`, `tests/`, `apps/mobile` are the kit's own examples) arrives — not for
organisation. Yarn 4 workspaces; the root `package.json` lists it.

1. Create `<dir>/package.json` — `name: "@__SCOPE__/<name>"`, `private: true`, its own
   `scripts` (`typecheck`, `test`), its own dependencies. **A dependency lives in the
   package that uses it**: the Docker build runs after the merge, so a misplaced one
   passes CI and breaks the deploy.
2. Add the directory to `workspaces` in the root `package.json`; `yarn install`.
3. `<dir>/tsconfig.json` extends the root `tsconfig.json`; restate the aliases it needs
   under `paths` (they do not inherit through `extends` when `baseUrl` differs).
4. Hook the package into the root gates by name: `typecheck:<name>` and `test:<name>`
   scripts in the root `package.json` — `yarn typecheck` picks up every `typecheck:*`
   automatically (`scripts/run-if-script.mjs`); add the `test:<name>` call to the root
   `test` script by hand.
5. Give it an `AGENTS.md` only if it has a rule of its own that is true nowhere else.
   Leave the `## Rules` section empty until you learn the first one — a package's rules
   are discovered, not predicted.

Validate: `yarn typecheck`, `yarn test`, `yarn lint` from the root; the package appears
in `yarn workspaces list`.

## Rules

- Keep new shared code unwired from consumers until the developer asks for integration.
- A new lib is not a place for unrelated cleanup.
- If the answer to "flat or split?" is unclear, it is flat.
