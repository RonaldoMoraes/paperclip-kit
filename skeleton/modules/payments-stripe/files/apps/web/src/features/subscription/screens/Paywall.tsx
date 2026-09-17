import { motion } from "motion/react";
import type { PlanName } from "@contracts/subscription/checkout";
import { SUBSCRIPTION_COPY } from "@domain/subscription/copy";
import { cn } from "@ui/cn";
import { Button } from "@ui/components/Button";
import { Screen } from "~/features/shell/components/Screen";
import { withMarks } from "~/lib/copyMarks";
import { riseIn, staggerEnter } from "~/lib/motion";

/**
 * The paywall — the one screen that asks for money.
 *
 * It shows what is sold and hands the choice back; the server decides the price, the trial
 * and the charge (`stripe-plugin.ts`), so nothing here can talk itself into a cheaper one.
 * The trial line is the server's answer too — `trialEligible` rides on the session, and the
 * checkout applies the same rule, so the copy and the charge cannot disagree.
 *
 * A plan already on record that is not paying — `past_due`, `unpaid`, `incomplete` — is not
 * a second checkout: it is a card to fix, which lives in Stripe's own billing portal.
 */
type Props = {
  plans: readonly PlanName[];
  plan: PlanName;
  trialEligible: boolean;
  /** Stripe's status for a plan on record, or null when there has never been one */
  status: string | null;
  /** whether a plan on record is one this app sold, and can therefore send to a billing portal */
  managedHere: boolean;
  pending: boolean;
  error: string | null;
  onChoose: (plan: PlanName) => void;
  onSubmit: () => void;
  onManageBilling: () => void;
};

const C = SUBSCRIPTION_COPY.paywall;

export function Paywall({
  plans,
  plan,
  trialEligible,
  status,
  managedHere,
  pending,
  error,
  onChoose,
  onSubmit,
  onManageBilling,
}: Props) {
  return (
    <Screen tag="paywall" className="px-5 pb-16 pt-20" enter={staggerEnter()}>
      <motion.h1 variants={riseIn} data-testid="paywall-title" className="font-serif text-display-2 text-ink">
        {withMarks(C.title, { em: "italic text-ink-brand" })}
      </motion.h1>

      <motion.p
        variants={riseIn}
        data-testid="paywall-body"
        className="mt-4 text-[15px] leading-relaxed text-ink-secondary"
      >
        {C.body}
      </motion.p>

      {trialEligible ? (
        <motion.p variants={riseIn} data-testid="paywall-trial" className="mt-3 text-[15px] font-medium text-ink-brand">
          {C.trial}
        </motion.p>
      ) : null}

      <motion.div variants={riseIn} className="mt-8 grid gap-3">
        {plans.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={plan === name}
            data-testid={`paywall-plan-${name}`}
            disabled={pending}
            onClick={() => onChoose(name)}
            className={cn(
              "card flex w-full items-baseline justify-between gap-3 rounded-sheet px-5 py-4 text-left",
              "transition-colors duration-150 ease-brand disabled:opacity-60",
              plan === name ? "ring-2 ring-brand-strong" : "hover:bg-surface-subtle"
            )}
          >
            <span className="text-[15px] font-semibold text-ink">{C.plans[name].name}</span>
            <span className="text-sm text-ink-secondary">{C.plans[name].note}</span>
          </button>
        ))}
      </motion.div>

      <motion.div variants={riseIn}>
        <Button size="lg" className="mt-8 w-full" data-testid="paywall-submit" disabled={pending} onClick={onSubmit}>
          {C.submit}
        </Button>
      </motion.div>

      {error ? (
        <motion.p
          variants={riseIn}
          role="alert"
          data-testid="paywall-error"
          className="mt-4 text-center text-sm text-error"
        >
          {error}
        </motion.p>
      ) : null}

      {status ? (
        <motion.section
          variants={riseIn}
          data-testid="paywall-lapsed"
          className="card mt-10 rounded-sheet px-5 py-4 text-center"
        >
          <p className="text-[15px] font-semibold text-ink">{C.lapsedTitle}</p>
          <p className="mt-2 text-sm text-ink-secondary">{managedHere ? C.lapsedBody : C.lapsedElsewhereBody}</p>
          {managedHere ? (
            <Button
              variant="ghost"
              className="mt-3"
              data-testid="paywall-manage-billing"
              disabled={pending}
              onClick={onManageBilling}
            >
              {C.manageBilling}
            </Button>
          ) : null}
        </motion.section>
      ) : null}
    </Screen>
  );
}
