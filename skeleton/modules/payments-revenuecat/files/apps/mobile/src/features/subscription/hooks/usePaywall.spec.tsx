import { renderScreen } from "@test/renderScreen";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Linking, Pressable, Text } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaywall } from "./usePaywall";

const useSession = vi.fn();
const refetchSession = vi.fn();
const identify = vi.fn();
const purchase = vi.fn();
const offering = vi.fn();
const restore = vi.fn();
const post = vi.fn();
const openURL = vi.fn();

vi.mock("~/lib/auth", () => ({
  authClient: { useSession: () => useSession() },
}));

vi.mock("~/lib/store", () => ({
  store: {
    identify: (customer: unknown) => identify(customer),
    offering: () => offering(),
    purchase: (pkg: unknown) => purchase(pkg),
    restore: () => restore(),
  },
  MANAGE_SUBSCRIPTION_URL: { ios: "ios://", android: "android://" },
}));

vi.mock("~/lib/http", () => ({ http: { post: (...args: unknown[]) => post(...args) } }));

const PACKAGE = {
  identifier: "$rc_annual",
  plan: "annual" as const,
  storeProductId: "annual",
  priceString: "$79.99",
  price: 79.99,
  intro: null,
};

const ACCESS = {
  active: true,
  provider: "revenuecat",
  status: "active",
  plan: "annual",
  ending: false,
  endsAt: null,
  trialEligible: false,
};

function Harness() {
  const wall = usePaywall();
  return (
    <>
      <Text testID="unavailable">{String(wall.unavailable)}</Text>
      <Text testID="pending">{String(wall.pending)}</Text>
      <Text testID="error">{wall.error ?? "-"}</Text>
      <Text testID="plans">{String(wall.offering?.packages.length ?? -1)}</Text>
      <Pressable testID="buy" onPress={() => wall.buy("annual")}>
        <Text>buy</Text>
      </Pressable>
      <Pressable testID="restore" onPress={wall.restore}>
        <Text>restore</Text>
      </Pressable>
      <Pressable testID="terms" onPress={wall.openTerms}>
        <Text>terms</Text>
      </Pressable>
    </>
  );
}

const press = (id: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(id));

describe("usePaywall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSession.mockReturnValue({
      data: { session: { id: "1" }, user: { id: "7", email: "a@b.c", name: "A" }, access: ACCESS },
      isPending: false,
      refetch: refetchSession,
    });
    offering.mockResolvedValue({ identifier: "default", packages: [PACKAGE] });
    identify.mockResolvedValue(undefined);
    purchase.mockResolvedValue({ kind: "purchased", storeProductId: "annual" });
    post.mockResolvedValue({ confirmed: true, access: ACCESS });
    refetchSession.mockResolvedValue(undefined);
    restore.mockResolvedValue(undefined);
    // The system browser is a seam this app does not own; the spy is the whole mock.
    openURL.mockResolvedValue(undefined);
    vi.spyOn(Linking, "openURL").mockImplementation((url: string) => openURL(url));
  });

  it("renders what the store is serving", async () => {
    renderScreen(<Harness />);

    await waitFor(() => expect(screen.getByTestId("plans")).toHaveTextContent("1"));
    expect(screen.getByTestId("unavailable")).toHaveTextContent("false");
  });

  // The store sells; the server decides. The purchase is not access until the server has
  // read RevenueCat and the session has been read again.
  it("identifies, sells, then asks the server and re-reads the session", async () => {
    renderScreen(<Harness />);
    await waitFor(() => expect(screen.getByTestId("plans")).toHaveTextContent("1"));

    await press("buy");

    await waitFor(() => expect(refetchSession).toHaveBeenCalled());
    expect(identify).toHaveBeenCalledWith({ id: "7", email: "a@b.c", name: "A" });
    expect(purchase).toHaveBeenCalledWith(PACKAGE);
    expect(post).toHaveBeenCalledWith("/api/subscription/revenuecat/confirm", expect.anything(), {
      storeProductId: "annual",
    });
    expect(screen.getByTestId("error")).toHaveTextContent("-");
  });

  // A closed sheet is not a failure and has nothing to say.
  it("says nothing when the sheet is closed", async () => {
    purchase.mockResolvedValue({ kind: "cancelled" });
    renderScreen(<Harness />);
    await waitFor(() => expect(screen.getByTestId("plans")).toHaveTextContent("1"));

    await press("buy");

    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("false"));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByTestId("error")).toHaveTextContent("-");
  });

  // They paid and the server cannot see it: said out loud, never left on the wall.
  it("says so when the server confirmed no access after a purchase", async () => {
    post.mockResolvedValue({ confirmed: true, access: { ...ACCESS, active: false } });
    renderScreen(<Harness />);
    await waitFor(() => expect(screen.getByTestId("plans")).toHaveTextContent("1"));

    await press("buy");

    await waitFor(() => expect(screen.getByTestId("error")).not.toHaveTextContent("-"));
  });

  it("reports a store that would not sell, and never calls the server", async () => {
    purchase.mockResolvedValue({ kind: "failed", message: "declined" });
    renderScreen(<Harness />);
    await waitFor(() => expect(screen.getByTestId("plans")).toHaveTextContent("1"));

    await press("buy");

    await waitFor(() => expect(screen.getByTestId("error")).not.toHaveTextContent("-"));
    expect(post).not.toHaveBeenCalled();
  });

  it("restores through the store and settles with the server", async () => {
    renderScreen(<Harness />);
    await waitFor(() => expect(screen.getByTestId("plans")).toHaveTextContent("1"));

    await press("restore");

    await waitFor(() => expect(restore).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/subscription/revenuecat/confirm", expect.anything(), {
      storeProductId: null,
    });
  });

  // A restore that quietly did nothing is indistinguishable from one that failed.
  it("says so when a restore found nothing", async () => {
    post.mockResolvedValue({ confirmed: false, access: { ...ACCESS, active: false } });
    renderScreen(<Harness />);
    await waitFor(() => expect(screen.getByTestId("plans")).toHaveTextContent("1"));

    await press("restore");

    await waitFor(() => expect(screen.getByTestId("error")).not.toHaveTextContent("-"));
  });

  it("reads a store with nothing to offer as unavailable, with a retry", async () => {
    offering.mockResolvedValue(null);
    renderScreen(<Harness />);

    await waitFor(() => expect(screen.getByTestId("unavailable")).toHaveTextContent("true"));
  });

  it("opens the terms in the system browser", async () => {
    renderScreen(<Harness />);
    await waitFor(() => expect(screen.getByTestId("plans")).toHaveTextContent("1"));

    await press("terms");

    expect(openURL).toHaveBeenCalledWith(expect.stringContaining("/terms"));
  });
});
