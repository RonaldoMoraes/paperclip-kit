import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFlowError } from "@contracts/auth/errors";
import { http } from "~/lib/http";
import { installSessionHeader, readSignedIn, signOut, useSessionGate } from "./session";

const useSession = vi.fn();
const getCookie = vi.fn();
const clientSignOut = vi.fn();
const notify = vi.fn();

vi.mock("~/lib/auth", () => ({
  authClient: {
    useSession: () => useSession(),
    getCookie: () => getCookie(),
    signOut: () => clientSignOut(),
    $store: { notify: (signal: string) => notify(signal) },
  },
}));

function Harness() {
  const { ready, allow, redirectTo } = useSessionGate();
  return (
    <>
      <Text testID="ready">{String(ready)}</Text>
      <Text testID="allow">{String(allow)}</Text>
      <Text testID="redirect">{redirectTo === undefined ? "-" : String(redirectTo)}</Text>
    </>
  );
}

describe("readSignedIn", () => {
  it("is a session in hand once the probe has answered, and never while it is pending", () => {
    expect(readSignedIn({ session: { id: "1" } }, false)).toBe(true);
    expect(readSignedIn({ session: { id: "1" } }, true)).toBe(false);
    expect(readSignedIn(null, false)).toBe(false);
  });
});

describe("useSessionGate", () => {
  it("holds the splash while the probe is pending", () => {
    useSession.mockReturnValue({ data: null, isPending: true });
    render(<Harness />);
    expect(screen.getByTestId("ready")).toHaveTextContent("false");
    expect(screen.getByTestId("allow")).toHaveTextContent("false");
  });

  it("opens the app on a session", () => {
    useSession.mockReturnValue({ data: { session: { id: "1" }, user: { id: "1" } }, isPending: false });
    render(<Harness />);
    expect(screen.getByTestId("allow")).toHaveTextContent("true");
    expect(screen.getByTestId("redirect")).toHaveTextContent("-");
  });

  it("sends a launch without one to sign-in", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    render(<Harness />);
    expect(screen.getByTestId("ready")).toHaveTextContent("true");
    expect(screen.getByTestId("allow")).toHaveTextContent("false");
    expect(screen.getByTestId("redirect")).toHaveTextContent("/sign-in");
  });
});

describe("installSessionHeader", () => {
  let remove: () => void = () => undefined;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }))
    );
    remove = installSessionHeader();
  });

  afterEach(() => {
    remove();
    vi.unstubAllGlobals();
  });

  // The whole of the phone's session on the wire: the cookie the auth client holds, read
  // when the request goes out, so a sign-in that lands later is carried by the next call.
  it("puts the stored cookie on every request the transport makes, and nothing when there is none", async () => {
    const { z } = await import("zod");
    const Answer = z.object({ ok: z.boolean() });
    getCookie.mockReturnValue("");
    await http.get("/api/check", Answer);
    expect((vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("Cookie");

    getCookie.mockReturnValue("acme-notes.session_token=t");
    await http.get("/api/check", Answer);
    expect((vi.mocked(fetch).mock.calls[1][1] as RequestInit).headers).toMatchObject({
      Cookie: "acme-notes.session_token=t",
    });
  });
});

describe("signOut", () => {
  it("signs out through the auth client and tells the session store", async () => {
    clientSignOut.mockResolvedValue({ error: null });
    await signOut();
    expect(notify).toHaveBeenCalledWith("$sessionSignal");
  });

  it("names a refusal and leaves the session alone", async () => {
    notify.mockClear();
    clientSignOut.mockResolvedValue({ error: { message: "Session store unavailable" } });
    await expect(signOut()).rejects.toBeInstanceOf(AuthFlowError);
    await expect(signOut()).rejects.toMatchObject({ message: "Session store unavailable" });
    expect(notify).not.toHaveBeenCalled();
  });
});
