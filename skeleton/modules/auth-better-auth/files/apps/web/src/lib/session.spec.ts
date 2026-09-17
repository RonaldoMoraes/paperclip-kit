import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNED_IN_SESSION } from "@contracts/mock-session";
import { narrowSession, readSession, refreshSession, requireSession, sessionKey } from "./session";

const getSession = vi.fn();

vi.mock("~/lib/auth", () => ({ authClient: { getSession: () => getSession() } }));

/** The auth client's answer: the wire payload with the expiry revived, as better-fetch hands it back. */
const probe = {
  ...SIGNED_IN_SESSION,
  session: { ...SIGNED_IN_SESSION.session, expiresAt: new Date("2099-01-01T00:00:00.000Z") },
};

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const location = { href: "/settings?tab=about" } as never;

beforeEach(() => {
  getSession.mockReset();
});

describe("narrowSession", () => {
  it("answers the contract's record: the narrow user, the expiry back as ISO-8601", () => {
    expect(narrowSession({ ...probe, user: { ...probe.user, image: "x" } as never })).toEqual(SIGNED_IN_SESSION);
  });

  // The other half of the auth-extensions seam: the server's `customSession` and the
  // `get-session` mock both put an extension's field on the payload, and this is the seam
  // that would silently drop it — `SessionRecord` is a plain object schema, so parsing the
  // whole answer would strip every key it does not name.
  it("carries a field an extension put on the probe through to the gate", () => {
    const carried = narrowSession({ ...probe, access: { plan: "pro" } } as never);

    expect(carried).toMatchObject({ ...SIGNED_IN_SESSION, access: { plan: "pro" } });
  });

  // Extras ride beside the session, never inside it: `user` and `session` are parsed and
  // spread last, so what a route reads as the session is still the narrow contract shape.
  it("keeps the session narrow while what rides beside it passes through whole", () => {
    const carried = narrowSession({
      ...probe,
      session: { ...probe.session, token: "raw" },
      access: { plan: "pro" },
    } as never);

    expect(carried.session).toEqual(SIGNED_IN_SESSION.session);
    expect(carried.access).toEqual({ plan: "pro" });
  });
});

describe("readSession", () => {
  it("asks the auth client once and caches the answer for the trip", async () => {
    getSession.mockResolvedValue({ data: probe, error: null });
    const queryClient = client();

    await expect(readSession(queryClient)).resolves.toEqual(SIGNED_IN_SESSION);
    await expect(readSession(queryClient)).resolves.toEqual(SIGNED_IN_SESSION);

    expect(getSession).toHaveBeenCalledTimes(1);
  });

  // A probe that fails is "no session", written back so the next reader does not retry it.
  it("reads a failed probe as signed out, and settles it for the trip", async () => {
    getSession.mockRejectedValue(new TypeError("Failed to fetch"));
    const queryClient = client();

    await expect(readSession(queryClient)).resolves.toBeNull();
    expect(queryClient.getQueryData(sessionKey)).toBeNull();
    await expect(readSession(queryClient)).resolves.toBeNull();
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("reads the auth client's own error as signed out too", async () => {
    getSession.mockResolvedValue({ data: null, error: { status: 500, message: "down" } });
    await expect(readSession(client())).resolves.toBeNull();
  });
});

describe("refreshSession", () => {
  it("drops the cached answer and asks again — the session after a sign-in", async () => {
    getSession.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: probe, error: null });
    const queryClient = client();

    await expect(readSession(queryClient)).resolves.toBeNull();
    await expect(refreshSession(queryClient)).resolves.toEqual(SIGNED_IN_SESSION);

    expect(getSession).toHaveBeenCalledTimes(2);
  });
});

describe("requireSession", () => {
  it("grants the session to the routes under the gate", async () => {
    getSession.mockResolvedValue({ data: probe, error: null });
    await expect(requireSession({ queryClient: client(), location })).resolves.toEqual({ session: SIGNED_IN_SESSION });
  });

  // The whole of the redirect: to sign-in, with the way back, replacing the entry so the
  // back button does not return to a screen the person may not see.
  it("sends a signed-out visitor to sign-in with the way back", async () => {
    getSession.mockResolvedValue({ data: null, error: null });

    const thrown = await requireSession({ queryClient: client(), location }).catch((error) => error);

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown.options).toMatchObject({
      to: "/account",
      search: { redirect: "/settings?tab=about" },
      replace: true,
    });
  });
});
