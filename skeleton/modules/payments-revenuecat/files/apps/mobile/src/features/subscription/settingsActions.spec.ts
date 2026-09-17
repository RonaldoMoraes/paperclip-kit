import { setTestPlatform } from "@test/platform";
import { Linking } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { manageSubscriptionUrl, settingsActions } from "./settingsActions";

const restore = vi.fn();
const post = vi.fn();
const notify = vi.fn();

vi.mock("~/lib/store", () => ({
  store: { restore: () => restore() },
  MANAGE_SUBSCRIPTION_URL: {
    ios: "https://apps.apple.com/account/subscriptions",
    android: "https://play.google.com/store/account/subscriptions",
  },
}));

vi.mock("~/lib/http", () => ({ http: { post: (...args: unknown[]) => post(...args) } }));

vi.mock("~/lib/auth", () => ({ authClient: { $store: { notify: (signal: string) => notify(signal) } } }));

const ACTIVE = {
  active: true,
  provider: "revenuecat",
  status: "active",
  plan: "annual",
  ending: false,
  endsAt: null,
  trialEligible: false,
};

const run = (id: string) => settingsActions.find((action) => action.id === id)?.run();

describe("the store's Settings rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restore.mockResolvedValue(undefined);
    post.mockResolvedValue({ confirmed: true, access: ACTIVE });
    vi.spyOn(Linking, "openURL").mockResolvedValue(true);
  });

  it("puts manage and restore on Settings, and no cancel button", () => {
    expect(settingsActions.map((action) => action.id)).toEqual(["manage-subscription", "restore-purchases"]);
  });

  // The store took the money; cancelling, changing plan and fixing a card all live there.
  it("opens the store's own subscriptions page for the platform this binary runs on", async () => {
    await run("manage-subscription");
    expect(Linking.openURL).toHaveBeenCalledWith("https://apps.apple.com/account/subscriptions");

    setTestPlatform("android");
    expect(manageSubscriptionUrl()).toContain("play.google.com");
  });

  it("says so when the store would not open, rather than shrugging", async () => {
    vi.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));

    await expect(run("manage-subscription")).rejects.toThrow(/store/i);
  });

  // The store re-attaches the receipt, the server reads RevenueCat, the session is read
  // again — the gate moves on that read and nothing here navigates.
  it("restores through the store, settles with the server and re-reads the session", async () => {
    await run("restore-purchases");

    expect(restore).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith("/api/subscription/revenuecat/confirm", expect.anything(), {
      storeProductId: null,
    });
    expect(notify).toHaveBeenCalledWith("$sessionSignal");
  });

  it("says so when a restore found nothing on this store account", async () => {
    post.mockResolvedValue({ confirmed: false, access: { ...ACTIVE, active: false } });

    await expect(run("restore-purchases")).rejects.toThrow();
  });
});
