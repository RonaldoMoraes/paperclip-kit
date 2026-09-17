import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderAt } from "~/testing/renderScreen";
import { Subscription } from "./Subscription";

const ENDS = new Date("2031-03-04T00:00:00.000Z");

async function renderPlan(over: Partial<Parameters<typeof Subscription>[0]> = {}) {
  const onManageBilling = vi.fn();
  await renderAt(
    "/subscription",
    <Subscription
      plan={over.plan ?? "annual"}
      status={over.status ?? "active"}
      ending={over.ending ?? false}
      endsAt={over.endsAt === undefined ? ENDS : over.endsAt}
      managedHere={over.managedHere ?? true}
      pending={over.pending ?? false}
      error={over.error ?? null}
      onManageBilling={onManageBilling}
    />
  );
  return { onManageBilling };
}

describe("Subscription", () => {
  it("names the plan that is held", async () => {
    await renderPlan({ plan: "monthly" });
    expect(screen.getByTestId("subscription-plan")).toHaveTextContent("monthly");
  });

  // A trial is not "the annual plan" yet — nothing has been charged, and the line has to
  // say so before a renewal date does.
  it("says a trial is a trial rather than naming the plan behind it", async () => {
    await renderPlan({ status: "trialing" });
    expect(screen.getByTestId("subscription-plan")).not.toHaveTextContent("annual");
  });

  it("dates the renewal, and the ending when there is one", async () => {
    await renderPlan();
    const renewing = screen.getByTestId("subscription-dates").textContent ?? "";
    expect(renewing).toContain(String(ENDS.getFullYear()));

    await renderPlan({ ending: true });
    expect(screen.getAllByTestId("subscription-dates")[1].textContent).not.toBe(renewing);
  });

  it("says nothing about dates when the server had none to give", async () => {
    await renderPlan({ endsAt: null });
    expect(screen.queryAllByTestId("subscription-dates")).toHaveLength(0);
  });

  it("hands off to Stripe's own page, and holds the button while it goes", async () => {
    const { onManageBilling } = await renderPlan();
    await userEvent.click(screen.getByTestId("subscription-manage-billing"));
    expect(onManageBilling).toHaveBeenCalledTimes(1);

    await renderPlan({ pending: true });
    expect(screen.getAllByTestId("subscription-manage-billing")[1]).toBeDisabled();
  });

  // Stripe's portal cannot cancel an Apple subscription, and the server refuses the call
  // anyway — offering the button would be a promise this app cannot keep.
  it("shows a plan bought elsewhere without offering to manage it", async () => {
    await renderPlan({ managedHere: false });

    expect(screen.getByTestId("subscription-managed-elsewhere")).toBeInTheDocument();
    expect(screen.queryAllByTestId("subscription-manage-billing")).toHaveLength(0);
  });

  it("shows a refused hand-off as an alert", async () => {
    await renderPlan({ error: "We couldn't open billing." });
    expect(screen.getByTestId("subscription-error")).toHaveRole("alert");
  });
});
