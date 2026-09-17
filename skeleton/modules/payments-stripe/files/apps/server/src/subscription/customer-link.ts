import type { DBAdapter, Where } from "@better-auth/core/db/adapter";
import type { BetterAuthPlugin } from "better-auth";

/**
 * Where the Stripe customer id lives, and why it is not on `user`.
 *
 * `@better-auth/stripe` declares a `stripeCustomerId` field on the **user** table and caches
 * the customer there the first time a checkout is opened. That table belongs to the auth
 * module: a payments module does not put a column on it, and the kit's one rule is that a
 * module never edits another layer's files. So this module keeps the customer where it
 * already keeps everything else about a subscription — on the subscription row — and this
 * plugin is what holds the plugin to that.
 *
 * It is an adapter wrapper rather than a database hook because the plugin reaches for the
 * raw adapter (`ctx.context.adapter.update({ model: "user", … })`), which no `databaseHooks`
 * entry sees. Better Auth builds `internalAdapter` from `context.adapter` **after** every
 * plugin's `init` has run, so one wrapper covers both.
 *
 * Nothing is lost. The plugin already stores the customer on the subscription row it
 * creates, reads it from there on every later call, and falls back to searching Stripe by
 * email when it has none — which is exactly what happens on a first purchase either way.
 * The one thing that changes is a webhook about a subscription this app never opened: with
 * no user to find, the reference is resolved from the subscription row that names the
 * customer, and a customer no row names is a subscription created outside this product,
 * which the plugin then skips and logs.
 */
export const UNMAPPED_USER_FIELD = "stripeCustomerId";

/** The plugin id, so a reader of the auth instance can see who wrapped the adapter. */
export const CUSTOMER_LINK_PLUGIN_ID = "subscription-customer-link";

/** The same object without the field the `user` table has no column for. */
function withoutCustomerId<T extends object>(value: T): T {
  const { [UNMAPPED_USER_FIELD]: _dropped, ...rest } = value as Record<string, unknown>;
  return rest as T;
}

const namesCustomerId = (where: Where[] | undefined): boolean =>
  (where ?? []).some((clause) => clause.field === UNMAPPED_USER_FIELD);

const customerIdIn = (where: Where[] | undefined): string | null => {
  const clause = (where ?? []).find((entry) => entry.field === UNMAPPED_USER_FIELD);
  return typeof clause?.value === "string" ? clause.value : null;
};

/**
 * Who a Stripe customer belongs to, answered from the subscription rows.
 *
 * The plugin's caller reads one field off what comes back — `user.id` — and uses it as the
 * reference id, which is what the subscription row already stores. So the answer is that
 * row's `referenceId` wearing the shape the caller expects.
 */
async function ownerOfCustomer(adapter: DBAdapter, stripeCustomerId: string | null): Promise<{ id: string } | null> {
  if (!stripeCustomerId) return null;
  const row = await adapter.findOne<{ referenceId?: unknown }>({
    model: "subscription",
    where: [{ field: "stripeCustomerId", value: stripeCustomerId }],
  });
  return typeof row?.referenceId === "string" ? { id: row.referenceId } : null;
}

/** The adapter, with the `user` table's missing column made a non-event on every path. */
export function withoutUserCustomerLink(adapter: DBAdapter): DBAdapter {
  return {
    ...adapter,
    create: (data) =>
      data.model === "user" ? adapter.create({ ...data, data: withoutCustomerId(data.data) }) : adapter.create(data),
    update: (data) => {
      if (data.model !== "user") return adapter.update(data);
      const update = withoutCustomerId(data.update);
      // Nothing left to write is nothing to write: the plugin ignores what this answers,
      // and an empty `data` is a Prisma error rather than a no-op.
      if (Object.keys(update).length === 0) return Promise.resolve(null);
      return adapter.update({ ...data, update });
    },
    findOne: async (data) => {
      if (data.model !== "user" || !namesCustomerId(data.where)) return adapter.findOne(data);
      return (await ownerOfCustomer(adapter, customerIdIn(data.where))) as never;
    },
    findMany: async (data) => {
      if (data.model !== "user" || !namesCustomerId(data.where)) return adapter.findMany(data);
      const owner = await ownerOfCustomer(adapter, customerIdIn(data.where));
      return (owner ? [owner] : []) as never;
    },
  };
}

/**
 * The wrapper as a plugin, so it travels with the Stripe plugin in one list and is applied
 * before it. `init` may return a context of its own, and what it returns is what every
 * later plugin — and the internal adapter Better Auth builds afterwards — is given.
 */
export function customerLinkPlugin(): BetterAuthPlugin {
  return {
    id: CUSTOMER_LINK_PLUGIN_ID,
    init: (ctx) => ({ context: { adapter: withoutUserCustomerLink(ctx.adapter) } }),
  };
}
