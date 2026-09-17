import { describe, expect, it, vi } from "vitest";
import { ApiException } from "../common/api-error";
import { SessionGuard } from "./session.guard";

const getSession = vi.fn();
const auth = { api: { getSession: (args: unknown) => getSession(args) } } as never;

const contextFor = (request: Record<string, unknown>) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as never;

describe("SessionGuard", () => {
  it("resolves the session from the request headers and leaves it on the request", async () => {
    const session = { session: { id: "1" }, user: { id: "1", email: "someone@example.com" } };
    getSession.mockResolvedValue(session);
    const request: Record<string, unknown> = { headers: { cookie: "__COOKIE_PREFIX__.session_token=t" } };

    await expect(new SessionGuard(auth).canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.session).toBe(session);
    expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });

  it("refuses an anonymous caller in the envelope, as UNAUTHORIZED", async () => {
    getSession.mockResolvedValue(null);

    const failure = new SessionGuard(auth).canActivate(contextFor({ headers: {} }));

    await expect(failure).rejects.toBeInstanceOf(ApiException);
    await expect(failure).rejects.toMatchObject({ response: { code: "UNAUTHORIZED" } });
  });

  it("treats a session with no user as anonymous", async () => {
    getSession.mockResolvedValue({ session: { id: "1" }, user: null });

    await expect(new SessionGuard(auth).canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(ApiException);
  });
});
