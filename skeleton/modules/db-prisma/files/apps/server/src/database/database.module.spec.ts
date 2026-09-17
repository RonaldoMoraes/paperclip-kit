import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it, vi } from "vitest";
import { DatabaseModule } from "./database.module";
import { PrismaClient } from "./prisma";
import { type ScopeRule, composePrisma, scopeExtension, scopeOperation } from "./scope-extension";

/**
 * A base that can never connect — port 1 — and never has to: a query reaches the database
 * only through the last extension applied, and every case here puts a recorder there. No
 * connection is opened and no env is read.
 */
function deadBase(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: "postgresql://127.0.0.1:1/none" }) });
}

const SOFT_DELETE: ScopeRule = { where: { deletedAt: null } };
const TENANT: ScopeRule = { where: { tenantId: 7 }, stamp: { tenantId: 7 } };

/** What the next layer down received for one operation under one rule. */
function run(rule: ScopeRule, operation: string, args: unknown): unknown {
  const query = vi.fn().mockResolvedValue(null);
  scopeOperation(rule, { args, operation, query });
  return query.mock.calls[0][0];
}

describe("scopeOperation", () => {
  it("ANDs the condition onto a read, keeping the caller's clause and any AND it already had", () => {
    expect(run(SOFT_DELETE, "findMany", { where: { done: false } })).toEqual({
      where: { done: false, AND: [{ deletedAt: null }] },
    });
    expect(run(SOFT_DELETE, "count", { where: { AND: [{ done: false }] } })).toEqual({
      where: { AND: [{ done: false }, { deletedAt: null }] },
    });
    expect(run(SOFT_DELETE, "findFirst", {})).toEqual({ where: { AND: [{ deletedAt: null }] } });
  });

  // `findUnique` and `update` refuse a `where` with no unique key at the top level, so the
  // condition must ride beside the key rather than wrap it.
  it("keeps the unique key at the top of a unique read or write", () => {
    expect(run(SOFT_DELETE, "findUnique", { where: { slug: "one" } })).toEqual({
      where: { slug: "one", AND: [{ deletedAt: null }] },
    });
    expect(run(SOFT_DELETE, "update", { where: { slug: "one" }, data: { done: true } })).toEqual({
      where: { slug: "one", AND: [{ deletedAt: null }] },
      data: { done: true },
    });
  });

  it("narrows a filtered write, so an updateMany or deleteMany cannot reach a hidden row", () => {
    expect(run(SOFT_DELETE, "deleteMany", { where: { done: true } })).toEqual({
      where: { done: true, AND: [{ deletedAt: null }] },
    });
  });

  it("stamps every insert, and the stamp wins over what the caller wrote", () => {
    expect(run(TENANT, "create", { data: { title: "t", tenantId: 99 } })).toEqual({
      data: { title: "t", tenantId: 7 },
    });
    expect(run(TENANT, "createMany", { data: [{ title: "a" }, { title: "b" }] })).toEqual({
      data: [
        { title: "a", tenantId: 7 },
        { title: "b", tenantId: 7 },
      ],
    });
    expect(run(TENANT, "upsert", { where: { slug: "s" }, create: { title: "t" }, update: { title: "u" } })).toEqual({
      where: { slug: "s", AND: [{ tenantId: 7 }] },
      create: { title: "t", tenantId: 7 },
      update: { title: "u" },
    });
  });

  it("stamps nothing under a rule with no stamp, and passes an operation it does not know through as it came", () => {
    const create = { data: { title: "t" } };
    expect(run(SOFT_DELETE, "create", create)).toBe(create);
    const raw = { sql: "select 1" };
    expect(run(TENANT, "$queryRaw", raw)).toBe(raw);
  });
});

describe("scopeExtension", () => {
  it("applies the rule of the model Prisma names and lets an unlisted model through untouched", async () => {
    const hook = scopeExtension({ ExampleItem: SOFT_DELETE }).query.$allModels.$allOperations;
    const query = vi.fn().mockResolvedValue([]);

    await hook({ model: "ExampleItem", operation: "findMany", args: { where: { done: true } }, query });
    await hook({ model: "Other", operation: "findMany", args: { where: { done: true } }, query });

    expect(query.mock.calls).toEqual([
      [{ where: { done: true, AND: [{ deletedAt: null }] } }],
      [{ where: { done: true } }],
    ]);
  });
});

type Recorded = { operation: string; args: unknown };

/** A recorder applied last, so it is the innermost layer and answers in place of the database. */
function recorder(recorded: Recorded[]) {
  return {
    query: {
      $allModels: {
        $allOperations: async ({ operation, args }: { operation: string; args: unknown }): Promise<unknown> => {
          recorded.push({ operation, args });
          return operation === "findMany" ? [] : null;
        },
      },
    },
  };
}

describe("composePrisma", () => {
  // Through the real `$extends`, not the hook alone: what a consumer's call becomes at the far
  // end is the claim, and only the composed client can make it.
  it("narrows a read and stamps an insert on the composed client", async () => {
    const recorded: Recorded[] = [];
    const db = composePrisma(deadBase(), { ExampleItem: TENANT }).$extends(recorder(recorded));

    await db.exampleItem.findMany({ where: { done: false } });
    await db.exampleItem.create({ data: { slug: "one", title: "One" } });

    expect(recorded).toEqual([
      { operation: "findMany", args: { where: { done: false, AND: [{ tenantId: 7 }] } } },
      { operation: "create", args: { data: { slug: "one", title: "One", tenantId: 7 } } },
    ]);
  });

  it("rewrites nothing under the default, empty scope", async () => {
    const recorded: Recorded[] = [];
    const db = composePrisma(deadBase()).$extends(recorder(recorded));

    await db.exampleItem.findUnique({ where: { slug: "one" } });

    expect(recorded).toEqual([{ operation: "findUnique", args: { where: { slug: "one" } } }]);
  });
});

describe("DatabaseModule", () => {
  it("closes the pool it was built on when the app shuts down", async () => {
    const base = deadBase();
    const disconnect = vi.spyOn(base, "$disconnect").mockResolvedValue();

    await new DatabaseModule(base).onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
