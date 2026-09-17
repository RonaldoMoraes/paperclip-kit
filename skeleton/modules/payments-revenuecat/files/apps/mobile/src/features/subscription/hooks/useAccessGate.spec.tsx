import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAccessGate } from "./useAccessGate";

const useSession = vi.fn();

vi.mock("~/lib/auth", () => ({ authClient: { useSession: () => useSession() } }));

const signedIn = (access?: Record<string, unknown>) => ({
  data: { session: { id: "1" }, user: { id: "7", email: "a@b.c" }, ...(access ? { access } : {}) },
  isPending: false,
});

function Harness() {
  const { ready, allow, redirectTo } = useAccessGate();
  return (
    <>
      <Text testID="ready">{String(ready)}</Text>
      <Text testID="allow">{String(allow)}</Text>
      <Text testID="redirect">{redirectTo === undefined ? "-" : String(redirectTo)}</Text>
    </>
  );
}

const read = (id: string) => screen.getByTestId(id);

describe("useAccessGate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("holds the splash while the session is still being read", () => {
    useSession.mockReturnValue({ data: null, isPending: true });
    render(<Harness />);
    expect(read("ready")).toHaveTextContent("false");
    expect(read("allow")).toHaveTextContent("false");
  });

  // The auth module's gate runs ahead of this one and already redirects to sign-in;
  // answering "not paid" here would race it and send a new arrival to a paywall.
  it("stands aside for somebody who is not signed in yet", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    render(<Harness />);
    expect(read("ready")).toHaveTextContent("true");
    expect(read("allow")).toHaveTextContent("true");
    expect(read("redirect")).toHaveTextContent("-");
  });

  it("opens the app on the access the server put on the session", () => {
    useSession.mockReturnValue(
      signedIn({
        active: true,
        provider: "revenuecat",
        status: "active",
        plan: "annual",
        ending: false,
        endsAt: null,
        trialEligible: false,
      })
    );
    render(<Harness />);
    expect(read("allow")).toHaveTextContent("true");
    expect(read("redirect")).toHaveTextContent("-");
  });

  it("sends a signed-in launch without a subscription to the paywall", () => {
    useSession.mockReturnValue(signedIn());
    render(<Harness />);
    expect(read("allow")).toHaveTextContent("false");
    expect(read("redirect")).toHaveTextContent("/paywall");
  });

  // A session whose access field is unreadable is no access — the safe answer, and the one
  // `readSubscriptionAccess` already decides.
  it("refuses when the access field on the session cannot be read", () => {
    useSession.mockReturnValue(signedIn({ active: "yes" }));
    render(<Harness />);
    expect(read("allow")).toHaveTextContent("false");
    expect(read("redirect")).toHaveTextContent("/paywall");
  });
});
