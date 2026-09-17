import { describe, expect, it, vi } from "vitest";
import { OptionalSessionGuard } from "./optional-session.guard";

const getSession = vi.fn();
const auth = { api: { getSession: (args: unknown) => getSession(args) } } as never;

const contextFor = (request: unknown) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as never;

describe("OptionalSessionGuard", () => {
  it("resolves the session from the request headers and leaves it on the request", async () => {
    const session = { session: { id: "1" }, user: { id: "1", email: "someone@example.com" } };
    getSession.mockResolvedValue(session);
    const request: Record<string, unknown> = { headers: { cookie: "__COOKIE_PREFIX__.session_token=t" } };

    await expect(new OptionalSessionGuard(auth).canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.session).toBe(session);
  });

  it("lets an anonymous caller through with nothing on the request", async () => {
    getSession.mockResolvedValue(null);
    const request: Record<string, unknown> = { headers: {} };

    await expect(new OptionalSessionGuard(auth).canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.session).toBeUndefined();
  });

  it("treats a session without a user as anonymous", async () => {
    getSession.mockResolvedValue({ session: { id: "1" }, user: null });
    const request: Record<string, unknown> = { headers: {} };

    await expect(new OptionalSessionGuard(auth).canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.session).toBeUndefined();
  });
});
