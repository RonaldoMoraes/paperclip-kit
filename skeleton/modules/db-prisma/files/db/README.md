# db

`@__SCOPE__/db` — the database, as one workspace: the Prisma schema
(`prisma/schema/*.prisma`, one file per module beside `base.prisma`), its migrations
(`prisma/migrations/`), the seed (`prisma/seed.ts`, idempotent) and the generated client
(`generated/`, gitignored, written by `yarn db:generate`). `prisma.config.ts` is what the
Prisma CLI reads; the connection string is `DATABASE_URL` from the root `.env`.

Every script is a root script too (`yarn db:<name>` delegates here): `db:generate`,
`db:migrate` (`prisma migrate dev`, interactive), `db:migrate:deploy` (CI and deploys),
`db:seed`, `db:studio`, `db:reset`. A schema change is made in a worktree started with
`yarn wt run --db`, so its migration lands on that worktree's own database.

Nothing in `apps/` imports this package except the seam,
`apps/server/src/database/prisma.ts` — [`docs/db-prisma.md`](../docs/db-prisma.md).
