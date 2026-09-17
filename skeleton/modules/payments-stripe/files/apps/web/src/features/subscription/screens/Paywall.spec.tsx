import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PLANS } from "@contracts/subscription/checkout";
import { renderAt } from "~/testing/renderScreen";
import { Paywall } from "./Paywall";

async function renderPaywall(over: Partial<Parameters<typeof Paywall>[0]> = {}) {
  const onChoose = vi.fn();
  const onSubmit = vi.fn();
  const onManageBilling = vi.fn();
  await renderAt(
    "/paywall",
    <Paywall
      plans={PLANS}
      plan={over.plan ?? "annual"}
      trialEligible={over.trialEligible ?? false}
      status={over.status ?? null}
      managedHere={over.managedHere ?? true}
      pending={over.pending ?? false}
      error={over.error ?? null}
      onChoose={onChoose}
      onSubmit={onSubmit}
      onManageBilling={onManageBilling}
    />
  );
  return { onChoose, onSubmit, onManageBilling };
}

describe("Paywall", () => {
  it("offers every plan the module sells, and marks the chosen one", async () => {
    await renderPaywall({ plan: "monthly" });

    for (const plan of PLANS) expect(screen.getByTestId(`paywall-plan-${plan}`)).toBeInTheDocument();
    expect(screen.getByTestId("paywall-plan-monthly")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("paywall-plan-annual")).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the plan that was picked rather than deciding anything itself", async () => {
    const { onChoose, onSubmit } = await renderPaywall();

    await userEvent.click(screen.getByTestId("paywall-plan-monthly"));
    expect(onChoose).toHaveBeenCalledWith("monthly");

    await userEvent.click(screen.getByTestId("paywall-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // `trialEligible` is the server's answer, and the checkout applies the same rule — a
  // promise made here that the charge then refuses is worse than never offering it.
  it("promises the trial when the server said it may", async () => {
    await renderPaywall({ trialEligible: true });
    expect(screen.getByTestId("paywall-trial")).toBeInTheDocument();
  });

  it("promises nothing to someone who has already had one", async () => {
    await renderPaywall({ trialEligible: false });
    expect(screen.queryAllByTestId("paywall-trial")).toHaveLength(0);
  });

  it("holds every control while the hand-off to Stripe is in flight", async () => {
    const { onSubmit } = await renderPaywall({ pending: true });

    expect(screen.getByTestId("paywall-submit")).toBeDisabled();
    expect(screen.getByTestId("paywall-plan-monthly")).toBeDisabled();
    await userEvent.click(screen.getByTestId("paywall-submit"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a refused hand-off as an alert, with the button still there to try again", async () => {
    await renderPaywall({ error: "We couldn't open checkout." });

    expect(screen.getByTestId("paywall-error")).toHaveRole("alert");
    expect(screen.getByTestId("paywall-submit")).toBeEnabled();
  });

  // A card that stopped working is not a second checkout: it is Stripe's billing portal.
  it("sends a plan that is on record but not paying to the billing portal", async () => {
    const { onManageBilling } = await renderPaywall({ status: "past_due" });

    expect(screen.getByTestId("paywall-lapsed")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("paywall-manage-billing"));
    expect(onManageBilling).toHaveBeenCalledTimes(1);
  });

  it("names the store instead of a portal when the lapsed plan was bought elsewhere", async () => {
    const { onManageBilling } = await renderPaywall({ status: "past_due", managedHere: false });

    expect(screen.getByTestId("paywall-lapsed")).toBeInTheDocument();
    expect(screen.queryAllByTestId("paywall-manage-billing")).toHaveLength(0);
    expect(onManageBilling).not.toHaveBeenCalled();
  });

  it("says nothing about billing to someone who has never subscribed", async () => {
    await renderPaywall({ status: null });
    expect(screen.queryAllByTestId("paywall-lapsed")).toHaveLength(0);
  });
});
