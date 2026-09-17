import type { PrismaClient } from "./prisma";

/**
 * A condition every query carries without the caller naming it.
 *
 * The mechanism is a Prisma client extension: per model, a `where` ANDed onto every read
 * and every filtered write, and a `stamp` merged into every insert. Soft delete is the usual
 * reason — `{ ExampleItem: { where: { deletedAt: null } } }` makes a deleted row invisible
 * to every finder in the process, and the one delete path that should see it holds the
 * unextended base. A tenant column is the other — `{ where: { tenantId }, stamp: { tenantId } }`
 * narrows the reads and marks the writes, so a row this client writes is a row it can read
 * back. The rules are keyed by the model name as the schema spells it (`ExampleItem`),
 * which is how Prisma names the model to a `$allModels` hook.
 */
export type ScopeRule = {
  /** ANDed onto the `where` of every read and of every write that takes one (`updateMany`, `delete`…). */
  where?: Record<string, unknown>;
  /** Merged over the `data` of every insert (`create`, `createMany`, an `upsert`'s `create`); the stamp wins. */
  stamp?: Record<string, unknown>;
};

export type ScopeRules = Record<string, ScopeRule>;

/**
 * The product's own scope. Empty: base's one model carries no soft-delete or tenant column.
 * A product that adds one lists the model here, and every holder of `PRISMA` — and every
 * script holding `openPrisma()` — is narrowed the same way from then on.
 */
export const DATABASE_SCOPE: ScopeRules = {};

/** What a query hook receives: the arguments, the operation, and the next layer down. */
export type Operation<A> = {
  model?: string;
  operation: string;
  args: A;
  query: (args: A) => Promise<unknown>;
};

// The finders and the aggregates: every operation that answers rows through a `where`.
const READ_OPERATIONS = new Set([
  "aggregate",
  "count",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
]);

// Every write that takes a `where` — by unique key or by filter. The condition rides in
// `AND` beside whatever the caller wrote (Prisma accepts `AND` on a unique `where`), so a row
// outside the scope is "not found" to an `update`, untouched by an `updateMany`, and an
// `upsert` on it creates rather than revives.
const WHERE_WRITE_OPERATIONS = new Set([
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

type Where = Record<string, unknown>;
type Row = Record<string, unknown>;
type Args = { where?: Where; data?: Row | Row[]; create?: Row };

/** The clause with the condition added, whatever `AND` it already carried; the unique key stays at the top. */
function narrowed(where: Where | undefined, condition: Where): Where {
  const held = where ?? {};
  const existing = Array.isArray(held.AND) ? held.AND : held.AND === undefined ? [] : [held.AND];
  return { ...held, AND: [...existing, condition] };
}

const stamped = (row: Row | undefined, stamp: Row): Row => ({ ...row, ...stamp });

/**
 * One operation, under one rule: reads and filtered writes are narrowed, inserts are
 * stamped, and anything else — a raw query, a transaction wrapper — passes through as it came.
 */
export function scopeOperation<A>(rule: ScopeRule, { args, operation, query }: Operation<A>): Promise<unknown> {
  let next = (args ?? {}) as Args;
  if (rule.where && (READ_OPERATIONS.has(operation) || WHERE_WRITE_OPERATIONS.has(operation))) {
    next = { ...next, where: narrowed(next.where, rule.where) };
  }
  if (rule.stamp && CREATE_OPERATIONS.has(operation)) {
    const stamp = rule.stamp;
    next =
      operation === "upsert"
        ? { ...next, create: stamped(next.create, stamp) }
        : {
            ...next,
            data: Array.isArray(next.data) ? next.data.map((row) => stamped(row, stamp)) : stamped(next.data, stamp),
          };
  }
  return query(next as A);
}

/**
 * The `$extends` argument: one hook over every model, dispatching on the model Prisma names.
 * A model the rules do not list passes straight through. With no rules the extension is a
 * no-op that still exists, so the composed client is one type whether or not the product
 * scopes anything.
 */
export function scopeExtension(rules: ScopeRules) {
  return {
    query: {
      $allModels: {
        $allOperations: <A>(op: Operation<A>): Promise<unknown> => {
          const rule = op.model === undefined ? undefined : rules[op.model];
          return rule ? scopeOperation(rule, op) : op.query(op.args);
        },
      },
    },
  };
}

/** The client every consumer holds: the base with the product's scope applied. */
export function composePrisma(base: PrismaClient, rules: ScopeRules = DATABASE_SCOPE) {
  return base.$extends(scopeExtension(rules));
}

/** What `PRISMA` resolves to and `openPrisma()` returns. A consumer types the slice it reads, not this. */
export type Db = ReturnType<typeof composePrisma>;
