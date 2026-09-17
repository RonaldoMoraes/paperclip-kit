import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StoreOffering } from "~/lib/store";
import { Paywall } from "./Paywall";

const OFFERING: StoreOffering = {
  identifier: "default",
  packages: [
    {
      identifier: "$rc_monthly",
      plan: "monthly",
      storeProductId: "monthly",
      priceString: "$9.99",
      price: 9.99,
      intro: null,
    },
    {
      identifier: "$rc_annual",
      plan: "annual",
      storeProductId: "annual",
      priceString: "$79.99",
      price: 79.99,
      intro: { price: 0, priceString: "$0.00", period: "P1W", periodUnit: "WEEK", periodNumberOfUnits: 1 },
    },
  ],
};

const props = (over: Partial<Parameters<typeof Paywall>[0]> = {}) => ({
  offering: OFFERING,
  trialEligible: false,
  unavailable: false,
  pending: false,
  error: null,
  onBuy: vi.fn(),
  onRestore: vi.fn(),
  onRetry: vi.fn(),
  onOpenTerms: vi.fn(),
  onOpenPrivacy: vi.fn(),
  ...over,
});

const press = (id: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(id));

describe("Paywall", () => {
  it("shows one row per plan the store is serving", () => {
    render(<Paywall {...props()} />);

    expect(screen.getByTestId("paywall-plan-monthly")).toBeInTheDocument();
    expect(screen.getByTestId("paywall-plan-annual")).toBeInTheDocument();
  });

  // Every number is the store's, in the person's own currency — this app quotes nothing.
  it("prints the store's own price, and the introductory one where the product carries it", () => {
    render(<Paywall {...props()} />);

    expect(screen.getByTestId("paywall-price-monthly")).toHaveTextContent("$9.99");
    expect(screen.getByTestId("paywall-price-annual")).toHaveTextContent("$0.00");
  });

  // `trialEligible` is the server's answer and only decides whether the line is shown.
  it("offers the trial line only when the server says a trial is still available", () => {
    const { rerender } = render(<Paywall {...props()} />);
    expect(screen.queryByTestId("paywall-trial")).toBeNull();

    rerender(<Paywall {...props({ trialEligible: true })} />);
    expect(screen.getByTestId("paywall-trial")).toBeInTheDocument();
  });

  it("hands the tap back with the plan and grants nothing itself", async () => {
    const onBuy = vi.fn();
    render(<Paywall {...props({ onBuy })} />);

    await press("paywall-plan-annual");

    expect(onBuy).toHaveBeenCalledExactlyOnceWith("annual");
  });

  it("waits rather than selling twice while something is in flight", async () => {
    const onBuy = vi.fn();
    render(<Paywall {...props({ pending: true, onBuy })} />);

    await press("paywall-plan-annual");

    expect(onBuy).not.toHaveBeenCalled();
    expect(screen.getByTestId("paywall-pending")).toBeInTheDocument();
  });

  it("waits on the store instead of showing an empty list", () => {
    render(<Paywall {...props({ offering: null })} />);

    expect(screen.getByTestId("paywall-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("paywall-plans")).toBeNull();
  });

  it("offers a retry when the store answered nothing", async () => {
    const onRetry = vi.fn();
    render(<Paywall {...props({ offering: null, unavailable: true, onRetry })} />);

    await press("paywall-retry");

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("prints the failure where the person is standing", () => {
    render(<Paywall {...props({ error: "That didn't go through." })} />);

    expect(screen.getByTestId("paywall-error")).toHaveTextContent("That didn't go through.");
  });

  // Restore is what somebody who already paid on this store account needs, and what a
  // store review looks for; so are the legal links.
  it("always offers restore, the terms and the privacy policy", async () => {
    const onRestore = vi.fn();
    const onOpenTerms = vi.fn();
    const onOpenPrivacy = vi.fn();
    render(<Paywall {...props({ onRestore, onOpenTerms, onOpenPrivacy })} />);

    await press("paywall-restore");
    await press("paywall-terms");
    await press("paywall-privacy");

    expect(onRestore).toHaveBeenCalledOnce();
    expect(onOpenTerms).toHaveBeenCalledOnce();
    expect(onOpenPrivacy).toHaveBeenCalledOnce();
    expect(screen.getByTestId("paywall-legal")).toBeInTheDocument();
  });
});
