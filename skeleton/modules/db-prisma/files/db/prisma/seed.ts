import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { databaseUrl } from "./database-url";

/**
 * The three example rows — the contract's fixture (`shared/contracts/example/mock-library.ts`),
 * inline because this workspace imports nothing from the apps. Kept equal by hand: a screen
 * built against the mock meets the same rows when the real server answers. Idempotent — an
 * upsert on `slug` — so a re-run (`wt run` seeds every fresh database) changes nothing.
 */
const EXAMPLE_ITEMS = [
  {
    slug: "read-the-architecture",
    title: "Read the architecture note",
    note: "docs/architecture.md says where each kind of code lives and why.",
    done: true,
    updatedAt: new Date("2026-01-05T09:00:00.000Z"),
  },
  {
    slug: "run-the-gates",
    title: "Run every gate once",
    note: "typecheck, lint, guards, test, contract, e2e — green before the first feature.",
    done: false,
    updatedAt: new Date("2026-01-05T09:05:00.000Z"),
  },
  {
    slug: "clone-the-example",
    title: "Clone the example feature",
    note: "/feature copies this feature across every layer; rename, then replace.",
    done: false,
    updatedAt: new Date("2026-01-05T09:10:00.000Z"),
  },
];

async function seed(prisma: PrismaClient): Promise<void> {
  for (const item of EXAMPLE_ITEMS) {
    await prisma.exampleItem.upsert({ where: { slug: item.slug }, create: item, update: item });
  }
  console.log(`[seed] ${EXAMPLE_ITEMS.length} example items`);
}

// The seed builds its own pool: it runs from the Prisma CLI (`prisma db seed`), before and
// without the server, which is why `db/prisma/` is the second place
// `biome/prisma-pool-boundary.grit` lets the adapter in. Everything in `apps/` holds the
// server's client instead.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });
try {
  await seed(prisma);
} finally {
  await prisma.$disconnect();
}
