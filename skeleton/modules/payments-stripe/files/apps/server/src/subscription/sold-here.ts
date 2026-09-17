import type { DBAdapter } from "@better-auth/core/db/adapter";
import { APIError, type BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { STRIPE_PROVIDER } from "@contracts/subscription/access";
import { SOLD_ELSEWHERE_MESSAGE, SUBSCRIPTION_SOLD_ELSEWHERE } from "@contracts/subscription/errors";

/**
 * Who sold a subscription, and what that allows.
 *
 * The `subscription` table is one table for every seller — that is what lets `accessFrom`
 * answer for all of them without being taught that a second one exists — and `provider` is
 * the single column that says which one wrote a row. Everything about that column lives
 * here: it is declared to Better Auth so the adapter carries it, it is written on every row
 * this module opens, and it is what refuses a management call the web has no business
 * making.
 *
 * Cancel, restore and the billing portal exist only where the plan was sold. Stripe cannot
 * cancel an Apple subscription; asked to try, its portal would either refuse or open the
 * account of whatever Stripe customer the row still names. So the refusal happens here,
 * before the route runs, and it is the server's rather than a client's — a second seller
 * cannot add a hook to this plugin list, and a client that forgot to ask must still get an
 * honest answer.
 *
 * Buying is deliberately not guarded: `/subscription/upgrade` is how somebody subscribes on
 * the web in the first place, and a person who bought on a phone and then buys here is a
 * product decision, not a wiring error. The paywall route already turns away anyone whose
 * session says they have access, whoever sold it.
 */

/** The column, in Better Auth's own field name — the Prisma column is `provider` too. */
export const PROVIDER_FIELD = "provider";

/** The plugin routes that change a subscription rather than describe or open one. */
export const WEB_MANAGED_PATHS = [
  "/subscription/cancel",
  "/subscription/restore",
  "/subscription/billing-portal",
] as const;

/** Whether a request is aimed at one of them. */
export function isWebManagedPath(path: string | undefined): boolean {
  return typeof path === "string" && (WEB_MANAGED_PATHS as readonly string[]).includes(path);
}

/** What a row has to say for this guard to read it. */
export type ProviderRow = { provider?: unknown };

/**
 * Whether the web may manage what this person holds.
 *
 * One row sold here is enough: somebody who subscribed on the web and later on a phone still
 * owns the web subscription, and refusing them the portal would strand a plan Stripe is
 * really billing. No rows at all is not a refusal either — there is nothing to manage, and
 * the route's own "subscription not found" is a better answer than this one.
 */
export function refusesManagement(rows: readonly ProviderRow[]): boolean {
  return rows.length > 0 && !rows.some((row) => row.provider === STRIPE_PROVIDER);
}

/**
 * The adapter, writing `provider` on every subscription row this module opens.
 *
 * The column has a database default, and this is why it is never reached: a default is a
 * floor for a row written before a second seller existed, not the way a seller says who it
 * is. `...data` last, so a caller that names a provider keeps it.
 */
export function stampProvider(adapter: DBAdapter): DBAdapter {
  return {
    ...adapter,
    create: (args) =>
      args.model === "subscription"
        ? adapter.create({ ...args, data: { [PROVIDER_FIELD]: STRIPE_PROVIDER, ...args.data } })
        : adapter.create(args),
  };
}

/** The rows one person holds, read through the adapter so the column names stay Better Auth's. */
async function rowsOf(adapter: DBAdapter, referenceId: string): Promise<ProviderRow[]> {
  return adapter.findMany<ProviderRow>({
    model: "subscription",
    where: [{ field: "referenceId", value: referenceId }],
  });
}

/**
 * The guard, as a plugin: the column's declaration, the stamp, and the refusal.
 *
 * Declaring the field is what makes the other two possible — Better Auth's adapter converts
 * a row through the schema, so a column it was never told about is dropped on the way in and
 * missing on the way out.
 */
export function soldHerePlugin(): BetterAuthPlugin {
  return {
    id: "subscription-sold-here",
    schema: {
      subscription: {
        fields: {
          [PROVIDER_FIELD]: { type: "string", required: false, defaultValue: STRIPE_PROVIDER },
        },
      },
    },
    init: (ctx) => ({ context: { adapter: stampProvider(ctx.adapter) } }),
    hooks: {
      before: [
        {
          // `ctx.path` is optional on the hook's context; a request without one matches nothing.
          matcher: (ctx) => isWebManagedPath(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            // No session is not this guard's refusal to make: the route below answers it,
            // and an error from here would tell an anonymous caller which plans exist.
            const session = await getSessionFromCtx(ctx).catch(() => null);
            const referenceId = session?.user?.id;
            if (!referenceId) return;

            if (refusesManagement(await rowsOf(ctx.context.adapter, String(referenceId)))) {
              // The code is named rather than derived: Better Auth builds one out of the
              // message otherwise, and a code spelled from a sentence is renamed by every
              // copy edit and branchable by nobody.
              throw new APIError("BAD_REQUEST", {
                code: SUBSCRIPTION_SOLD_ELSEWHERE,
                message: SOLD_ELSEWHERE_MESSAGE,
              });
            }
          }),
        },
      ],
    },
  };
}
