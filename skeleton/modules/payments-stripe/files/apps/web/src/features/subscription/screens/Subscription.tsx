import { motion } from "motion/react";
import { fill } from "@domain/copy";
import { SUBSCRIPTION_COPY } from "@domain/subscription/copy";
import { cn } from "@ui/cn";
import { Button } from "@ui/components/Button";
import { Screen } from "~/features/shell/components/Screen";
import { TAB_BAR_PAD } from "~/features/shell/components/TabBar";
import { withMarks } from "~/lib/copyMarks";
import { riseIn, staggerEnter } from "~/lib/motion";

/**
 * The plan, as the person holding it reads it.
 *
 * Everything on this screen came off the session — the server applied the predicate and
 * decided what "ending" means across both of Stripe's shapes — so nothing here derives an
 * entitlement or interprets a status. It sits behind `_app/_paid`, which is what makes it
 * the module's own proof that the layout gate works.
 *
 * Managing the plan is one button, and it leaves for Stripe: the card, the invoices and
 * cancelling all live on the page that took the money.
 */
type Props = {
  /** the plan name the server stored, `null` only if a row somehow carries none */
  plan: string | null;
  /** Stripe's own status — what tells a trial apart from a plan being charged */
  status: string | null;
  /** scheduled to stop and not renew */
  ending: boolean;
  /**
   * Whether this app sold the plan, and can therefore manage it. A plan bought in a store is
   * shown and never changed — Stripe's portal cannot cancel an Apple subscription, and the
   * server refuses the call anyway (`sold-here.ts`).
   */
  managedHere: boolean;
  /** when it stops, or when it renews when it is not ending */
  endsAt: Date | null;
  pending: boolean;
  error: string | null;
  onManageBilling: () => void;
};

const C = SUBSCRIPTION_COPY.plan;

const day = (date: Date): string =>
  date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export function Subscription({ plan, status, ending, endsAt, managedHere, pending, error, onManageBilling }: Props) {
  return (
    <Screen tag="subscription" className={cn("px-5 pt-20", TAB_BAR_PAD)} enter={staggerEnter()}>
      <motion.h1 variants={riseIn} data-testid="subscription-title" className="font-serif text-display-2 text-ink">
        {withMarks(C.title, { em: "italic text-ink-brand" })}
      </motion.h1>

      <motion.section variants={riseIn} className="card mt-6 rounded-sheet px-5 py-4">
        <p data-testid="subscription-plan" className="text-[15px] font-semibold text-ink">
          {status === "trialing" ? C.trialing : fill(C.on, { plan: plan ?? "—" })}
        </p>
        {endsAt ? (
          <p data-testid="subscription-dates" className="mt-2 text-sm text-ink-secondary">
            {fill(ending ? C.ends : C.renews, { date: day(endsAt) })}
          </p>
        ) : null}
      </motion.section>

      <motion.div variants={riseIn} className="mt-8">
        {managedHere ? (
          <>
            <Button
              size="lg"
              className="w-full"
              data-testid="subscription-manage-billing"
              disabled={pending}
              onClick={onManageBilling}
            >
              {C.manageBilling}
            </Button>
            <p className="mt-3 text-center text-sm text-ink-tertiary">{C.manageNote}</p>
          </>
        ) : (
          <div data-testid="subscription-managed-elsewhere" className="text-center">
            <p className="text-[15px] font-semibold text-ink">{C.elsewhere}</p>
            <p className="mt-2 text-sm text-ink-secondary">{C.elsewhereNote}</p>
          </div>
        )}
      </motion.div>

      {error ? (
        <motion.p
          variants={riseIn}
          role="alert"
          data-testid="subscription-error"
          className="mt-4 text-center text-sm text-error"
        >
          {error}
        </motion.p>
      ) : null}
    </Screen>
  );
}
