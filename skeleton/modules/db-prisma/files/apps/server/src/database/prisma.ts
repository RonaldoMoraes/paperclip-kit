/**
 * The one database seam.
 *
 * Only the generated Prisma client crosses here, and every file in `apps/server` that needs
 * it — the client, a model type, the `Prisma` namespace — imports from THIS file, never from
 * `@__SCOPE__/db` (`biome/db-seam.grit` errors on any other importer). When the database
 * workspace moves or the client is generated somewhere else, the line below is everything
 * that changes.
 *
 * The client is generated into `db/generated` (gitignored) by `yarn db:generate`; when this
 * import does not resolve, that is the command to run.
 */
export * from "@__SCOPE__/db/generated/prisma/client";
