- **One database seam.** The database is the `db` workspace: its schema
  (`db/prisma/schema/*.prisma`), its migrations, its seed, its generated client.
  A new table or column is a migration there, made in a worktree started with
  `yarn wt run --db`, so it never reaches the shared database. Prisma enters the server
  only through `apps/server/src/database/prisma.ts` (`db-seam.grit`), and a pool is built
  only in that directory (`prisma-pool-boundary.grit`). Hold the client the module hands
  out — `PRISMA` in Nest, `openPrisma()` in a script — never a pool of your own; a store
  names the slice of it it reads as a structural type, so its spec needs no database.
