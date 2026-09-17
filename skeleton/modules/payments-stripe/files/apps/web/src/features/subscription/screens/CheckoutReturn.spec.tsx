import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAt, routeTestId } from "~/testing/renderScreen";
import { CheckoutReturn } from "./CheckoutReturn";

const renderReturn = (active: boolean, status: string | null) =>
  renderAt("/checkout/return", <CheckoutReturn active={active} status={status} />);

describe("CheckoutReturn", () => {
  it("confirms a plan that is paying, and offers the way on", async () => {
    await renderReturn(true, "active");

    expect(screen.getByTestId("checkout-return-confirmed")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("checkout-return-continue"));
    expect(await screen.findByTestId(routeTestId("/"))).toBeInTheDocument();
  });

  // A trial is a settled outcome, and it is the one the copy has to get right: nothing has
  // been charged yet, and saying otherwise is how a refund request starts.
  it("says a trial is a trial", async () => {
    await renderReturn(true, "trialing");

    expect(screen.getByTestId("checkout-return-confirmed")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-return-note").textContent).toMatch(/charged/i);
  });

  // Stripe having a subscription is not the same as the buyer having one: `incomplete`,
  // `past_due` and `unpaid` all arrive here with a status and no access.
  it("does not confirm a checkout that settled into a status nobody can use", async () => {
    await renderReturn(false, "past_due");

    expect(screen.getByTestId("checkout-return-unconfirmed")).toBeInTheDocument();
    expect(screen.queryAllByTestId("checkout-return-confirmed")).toHaveLength(0);
  });

  it("sends an unconfirmed return back to the paywall", async () => {
    await renderReturn(false, null);

    await userEvent.click(screen.getByTestId("checkout-return-retry"));
    expect(await screen.findByTestId(routeTestId("/paywall"))).toBeInTheDocument();
  });
});
