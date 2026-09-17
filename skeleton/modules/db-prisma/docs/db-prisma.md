# Database (Prisma)

Postgres through Prisma 7. The database is one workspace, `db/` (`@__SCOPE__/db`); the
server reaches it through one file, one token and one pool; a script gets the same client
from one function. Everything below is present tense — what the module does once it is on.

## Files

| File | Holds |
| --- | --- |
| [`db/prisma/schema/base.prisma`](../db/prisma/schema/base.prisma) | The generator, the datasource and base's one model, `ExampleItem`. Every `*.prisma` in `db/prisma/schema/` is part of the schema: a module ships `prisma/schema/<module>.prisma` beside it and never edits it |
| [`db/prisma.config.ts`](../db/prisma.config.ts) | What the Prisma CLI reads: the schema directory, the migrations directory, the seed command, the connection string |
| [`db/prisma/database-url.ts`](../db/prisma/database-url.ts) | `DATABASE_URL` for the CLI and the seed — the root `.env`, an exported value winning, the local default last |
| [`db/prisma/seed.ts`](../db/prisma/seed.ts) | The three example rows, upserted on `slug` — the contract's fixture, inline |
| `db/generated/` | The client, written by `yarn db:generate`; gitignored |
| [`apps/server/src/database/prisma.ts`](../apps/server/src/database/prisma.ts) | **The seam.** `export * from "@__SCOPE__/db/generated/prisma/client"` — the only file that imports the database package |
| [`database.config.ts`](../apps/server/src/database/database.config.ts) | `loadDatabaseConfig(env)` → `{ url }`; the server's only reader of `DATABASE_URL` |
| [`prisma-pool.ts`](../apps/server/src/database/prisma-pool.ts) | `createPrismaPool(env)` — the only `@prisma/adapter-pg` importer in `apps/` — and `openPrisma(env)` for scripts |
| [`scope-extension.ts`](../apps/server/src/database/scope-extension.ts) | `scopeExtension(rules)`, `DATABASE_SCOPE`, `composePrisma(base)` and the `Db` type |
| [`database.module.ts`](../apps/server/src/database/database.module.ts) | `@Global()`: the pool behind a private token, `PRISMA` composed over it, disconnected on shutdown |
| [`database.types.ts`](../apps/server/src/database/database.types.ts) | The `PRISMA` symbol |
| [`example.store.prisma.ts`](../apps/server/src/database/example.store.prisma.ts) | `PrismaExampleStore` over a structural `ExampleDb` slice — the reference store |
| [`docker-compose.db.yml`](../docker-compose.db.yml) | Postgres 16, pinned, with a health check and a named volume; the file `yarn wt` keys its database steps on |

## The seam

`apps/server/src/database/prisma.ts` re-exports the generated client and is the only file
that names `@__SCOPE__/db` — [`db-seam.grit`](../biome/db-seam.grit) errors on any other
importer, in any layer. A server file that needs the client, a model type or the `Prisma`
namespace imports the seam: `import type { Prisma } from "../database/prisma"`. Shared
code and the client apps never touch the database: a contract is zod over the wire shape.
When the workspace moves or the client is generated elsewhere, the seam's one line changes.

## The pool and the token

One process, one pool. `DatabaseModule` builds it in a `useFactory` (nothing is built at
import, so a spec that imports a controller opens no connection and reads no env), keeps
it behind a private `PRISMA_BASE` token, and exports `PRISMA` — the base with the scope
extension applied. `onModuleDestroy` disconnects the base once; the composed client is a
view of it. [`prisma-pool-boundary.grit`](../biome/prisma-pool-boundary.grit) keeps
`@prisma/adapter-pg` inside `apps/server/src/database/` (and `db/prisma/`, where the seed
builds its own before the server exists): a pool built anywhere else is a second set of
connections carrying none of the scope.

A consumer injects the token and types the slice it reads:

```ts
constructor(@Inject(PRISMA) private readonly db: ExampleDb) {}
```

## Structural slices

A store declares the operations it makes as a type — `ExampleDb` in
`example.store.prisma.ts` names `findMany`, `findUnique` and `update` on `exampleItem`
with the arguments and rows it uses, nothing more. The real client satisfies it
structurally (`prismaExampleStore(db: Db)` is where `typecheck` proves that), and a spec
satisfies it with three closures and no database
([`example.store.prisma.spec.ts`](../apps/server/src/database/example.store.prisma.spec.ts)).
A service never sees Prisma at all: it declares its own structural store type
(`ExampleStore` in `example.service.ts`) and the Prisma store implements it.

## Swapping the memory store

Base's `ExampleModule` seeds `MemoryExampleStore` from the contract's fixture. A feature
that keeps its rows in Postgres replaces that one provider in its own module — the
controller and the service never learn of it:

```ts
import { PRISMA } from "../database/database.types";
import { prismaExampleStore } from "../database/example.store.prisma";
import { EXAMPLE_STORE } from "./example.types";

@Module({
  controllers: [ExampleController],
  providers: [{ provide: EXAMPLE_STORE, inject: [PRISMA], useFactory: prismaExampleStore }],
})
export class ExampleModule {}
```

`/feature` clones the memory store; the Prisma store is the shape to copy when the feature
needs a table — its model in `db/prisma/schema/<feature>.prisma`, its migration, its slice.

## The scope extension

`scope-extension.ts` is a Prisma client extension that carries a condition every query
would otherwise have to repeat. Per model, keyed as the schema spells it: a `where` ANDed
onto every read and every write that takes one (the unique key stays at the top, so
`findUnique` and `update` keep working), and a `stamp` merged over every insert. Soft
delete is `{ ExampleItem: { where: { deletedAt: null } } }`; a tenant is
`{ where: { tenantId }, stamp: { tenantId } }`. `DATABASE_SCOPE` holds the product's
rules and is empty in base — the extension still exists, so `PRISMA` is one type whether
or not anything is scoped. `composePrisma(base, rules)` is the composition; `PRISMA` and
`openPrisma()` both go through it, so a script sees exactly what the server sees.
[`database.module.spec.ts`](../apps/server/src/database/database.module.spec.ts) pins the
rewriting through the real `$extends`, with a recorder in place of the database.

## Scripts

Root scripts delegate to the workspace (`yarn --cwd db …`); every one is also a root
`yarn db:<name>`:

| Script | Runs | When |
| --- | --- | --- |
| `db:generate` | `prisma generate` → `db/generated/` | After `yarn install`, after a schema change; CI runs it before `typecheck` |
| `db:migrate` | `prisma migrate dev` | A schema change, in a terminal, in a worktree started with `yarn wt run --db`; `--name <what>` names the migration |
| `db:migrate:deploy` | `prisma migrate deploy` | CI, deploys, and `wt run` on an existing database |
| `db:seed` | `prisma db seed` → `tsx prisma/seed.ts` | A fresh database (`wt run` does it); idempotent |
| `db:studio` | `prisma studio` | Looking at rows |
| `db:reset` | `prisma migrate reset` | A development database back to nothing, then migrated and seeded |
| `typecheck:db` | `tsc --noEmit -p db/tsconfig.json` | Part of `yarn typecheck`: the seed and the config compile |

A script of the product's own — a backfill, a report — holds the client the same way the
server does:

```ts
const { prisma, close } = openPrisma(process.env);
try {
  await prisma.exampleItem.count();
} finally {
  await close();
}
```

## The worktree `--db` rule

Every worktree shares the local `__DB_NAME__` database. A branch that changes
`db/prisma/` runs in a worktree started with `yarn wt run --db`, which creates
`__DB_NAME___<branch>` on the same container, migrates and seeds it, and exports its URL to
the stack — so a migration under development never reaches the shared database, and `wt
run` refuses to start a schema-changing branch without it. [`worktrees.md`](worktrees.md)
has the CLI; `AGENTS.md` carries the rule.

## Env

| Variable | Read by | Default |
| --- | --- | --- |
| `DATABASE_URL` | `apps/server/src/database/database.config.ts` (server), `db/prisma/database-url.ts` (CLI, seed) | `postgresql://postgres:postgres@localhost:5432/__DB_NAME__` |

A missing value is not a boot failure: the default is the compose file's database, and a
connection that cannot be made fails on the first query, naming the host it tried.
