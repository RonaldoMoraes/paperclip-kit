import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionFlowError } from "@contracts/subscription/errors";
import { useUpgrade } from "~/features/subscription/hooks/useUpgrade";
import { renderAt } from "~/testing/renderScreen";

const startCheckout = vi.fn();

vi.mock("~/lib/subscription", () => ({
  startCheckout: (...args: unknown[]) => startCheckout(...args),
}));

function Harness() {
  const { plans, plan, choose, start, pending, error } = useUpgrade();
  return (
    <div>
      <p data-testid="upgrade-plan">{`plan:${plan}`}</p>
      <p data-testid="upgrade-plans">{`plans:${plans.join(",")}`}</p>
      <p data-testid="upgrade-pending">{`pending:${pending}`}</p>
      <p data-testid="upgrade-error">{`error:${error ?? "-"}`}</p>
      <button type="button" data-testid="upgrade-monthly" onClick={() => choose("monthly")}>
        monthly
      </button>
      <button type="button" data-testid="upgrade-start" onClick={start}>
        start
      </button>
    </div>
  );
}

const render = () => renderAt("/paywall", <Harness />);

describe("the paywall's one action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startCheckout.mockResolvedValue(undefined);
  });

  it("offers both plans and opens on the annual one", async () => {
    await render();
    expect(screen.getByTestId("upgrade-plans")).toHaveTextContent("plans:monthly,annual");
    expect(screen.getByTestId("upgrade-plan")).toHaveTextContent("plan:annual");
  });

  it("sends the plan that was chosen, and only the plan", async () => {
    await render();
    await userEvent.click(screen.getByTestId("upgrade-monthly"));
    await userEvent.click(screen.getByTestId("upgrade-start"));

    await waitFor(() => expect(startCheckout).toHaveBeenCalledWith("monthly"));
  });

  it("shows one line when the hand-off is refused, and keeps the choice", async () => {
    startCheckout.mockRejectedValue(new SubscriptionFlowError("stripe said no"));
    await render();

    await userEvent.click(screen.getByTestId("upgrade-start"));

    await waitFor(() => expect(screen.getByTestId("upgrade-error")).not.toHaveTextContent("error:-"));
    expect(screen.getByTestId("upgrade-plan")).toHaveTextContent("plan:annual");
  });
});
