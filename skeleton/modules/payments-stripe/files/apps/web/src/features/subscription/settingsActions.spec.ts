import { beforeEach, describe, expect, it, vi } from "vitest";
import { settingsActions } from "./settingsActions";

const navigate = vi.fn();

vi.mock("~/app/router", () => ({ router: { navigate: (options: unknown) => navigate(options) } }));

describe("the subscription row on Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is one row, and not a destructive one", () => {
    expect(settingsActions.map(({ id, tone }) => ({ id, tone }))).toEqual([{ id: "subscription", tone: undefined }]);
  });

  // Behind the entitlement layout on purpose: a lapsed plan lands on the paywall, which is
  // where the card can be fixed.
  it("goes to the plan screen", async () => {
    await settingsActions[0].run();
    expect(navigate).toHaveBeenCalledWith({ to: "/subscription" });
  });
});
