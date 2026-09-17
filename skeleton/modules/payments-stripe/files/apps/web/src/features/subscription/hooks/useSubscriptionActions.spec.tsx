import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionFlowError } from "@contracts/subscription/errors";
import { useSubscriptionActions } from "~/features/subscription/hooks/useSubscriptionActions";
import { renderAt } from "~/testing/renderScreen";

const openBillingPortal = vi.fn();

vi.mock("~/lib/subscription", () => ({
  openBillingPortal: () => openBillingPortal(),
}));

function Harness() {
  const { manageBilling, pending, error } = useSubscriptionActions();
  return (
    <div>
      <p data-testid="actions-pending">{`pending:${pending}`}</p>
      <p data-testid="actions-error">{`error:${error ?? "-"}`}</p>
      <button type="button" data-testid="actions-billing" onClick={manageBilling}>
        billing
      </button>
    </div>
  );
}

describe("what can be done with a subscription that exists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openBillingPortal.mockResolvedValue(undefined);
  });

  it("hands the page to Stripe's own account page", async () => {
    await renderAt("/settings", <Harness />);
    await userEvent.click(screen.getByTestId("actions-billing"));

    await waitFor(() => expect(openBillingPortal).toHaveBeenCalledTimes(1));
  });

  it("shows one line when the portal will not open", async () => {
    openBillingPortal.mockRejectedValue(new SubscriptionFlowError("no customer"));
    await renderAt("/settings", <Harness />);

    await userEvent.click(screen.getByTestId("actions-billing"));

    await waitFor(() => expect(screen.getByTestId("actions-error")).not.toHaveTextContent("error:-"));
  });
});
