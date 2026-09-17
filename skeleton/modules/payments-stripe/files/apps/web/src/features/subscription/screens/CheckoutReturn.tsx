import { useNavigate } from "@tanstack/react-router";
import { SUBSCRIPTION_COPY } from "@domain/subscription/copy";
import { Button } from "@ui/components/Button";
import { Screen } from "~/features/shell/components/Screen";
import { withMarks } from "~/lib/copyMarks";

/**
 * Where Stripe sends the browser back.
 *
 * The route settled the one question — is there a subscription — from Stripe's own Checkout
 * Session before this rendered, so there is nothing to poll for and no webhook to wait on.
 *
 * What it branches on is the access predicate, never the presence of a status: a checkout
 * can settle into `incomplete`, `past_due` or `unpaid`, which is Stripe having a
 * subscription and the person having nothing.
 */
type Props = {
  /** whether what was just bought may be used — the server's predicate, already applied */
  active: boolean;
  /** Stripe's own status, which is what tells a trial apart from a plan being charged */
  status: string | null;
};

const C = SUBSCRIPTION_COPY.checkoutReturn;
const em = { em: "italic text-ink-brand" };

export function CheckoutReturn({ active, status }: Props) {
  const navigate = useNavigate();
  const trialing = status === "trialing";

  if (!active) {
    return (
      <Screen tag="checkout-return" center className="text-center">
        <div>
          <h1 className="font-serif text-display-2 text-ink" data-testid="checkout-return-unconfirmed">
            {withMarks(C.unconfirmedTitle, em)}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-secondary" data-testid="checkout-return-note">
            {C.unconfirmedBody}
          </p>
          <Button
            size="lg"
            className="mt-8 w-full"
            data-testid="checkout-return-retry"
            onClick={() => navigate({ to: "/paywall", replace: true })}
          >
            {C.retry}
          </Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen tag="checkout-return" center className="text-center">
      <div>
        <h1 className="font-serif text-display-2 text-ink" data-testid="checkout-return-confirmed">
          {withMarks(trialing ? C.trialingTitle : C.confirmedTitle, em)}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-secondary" data-testid="checkout-return-note">
          {trialing ? C.trialingBody : C.confirmedBody}
        </p>
        <Button
          size="lg"
          className="mt-8 w-full"
          data-testid="checkout-return-continue"
          onClick={() => navigate({ to: "/", replace: true })}
        >
          {C.continue}
        </Button>
      </div>
    </Screen>
  );
}
