import { getResponse } from "msw";
import { describe, expect, it } from "vitest";
import { MOCK_USER, SESSION_COOKIE, SIGNED_OUT_VALUE, mockSessionValue } from "../mock-session";
import { handlers } from "./index";

const ORIGIN = "http://localhost";

async function call(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const { cookie, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await getResponse(handlers, new Request(`${ORIGIN}${path}`, { ...rest, headers }));
  if (!response) throw new Error(`no handler answered ${path}`);
  return response;
}

const signedOut = `${SESSION_COOKIE}=${SIGNED_OUT_VALUE}`;

describe("the account mocks", () => {
  it("answer the mock user to a run that never signed out, and the person a sign-in named", async () => {
    expect(await (await call("/api/account/me")).json()).toEqual(MOCK_USER);
    const them = { ...MOCK_USER, email: "them@example.com" };
    const answer = await call("/api/account/me", { cookie: `${SESSION_COOKIE}=${mockSessionValue(them)}` });
    expect(await answer.json()).toEqual(them);
  });

  it("refuse an anonymous caller in the envelope", async () => {
    const refused = await call("/api/account/me", { cookie: signedOut });
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("delete the account and leave the signed-out marker, so the next probe finds nobody", async () => {
    const deleted = await call("/api/account", { method: "DELETE" });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true });
    const jar = deleted.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    expect(jar).toContain(`${SESSION_COOKIE}=${SIGNED_OUT_VALUE}`);
    expect((await call("/api/account/me", { cookie: jar })).status).toBe(401);
    expect((await call("/api/account", { method: "DELETE", cookie: jar })).status).toBe(401);
  });
});
