import { getResponse } from "msw";
import { describe, expect, it } from "vitest";
import { MOCK_USER, SESSION_COOKIE, SIGNED_OUT_VALUE, sessionExtraCookie } from "../mock-session";
import { handlers } from "./index";
import { THROTTLED_EMAIL } from "./send-verification-otp.mock";
import { EXPIRED_OTP, MOCK_OTP, TOO_MANY_ATTEMPTS_OTP } from "./sign-in-email-otp.mock";

const ORIGIN = "http://localhost";

/** One request through the handler list, the way the Playwright fixture and the apps drive it. */
async function call(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const { cookie, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await getResponse(handlers, new Request(`${ORIGIN}${path}`, { ...rest, headers }));
  if (!response) throw new Error(`no handler answered ${path}`);
  return response;
}

const post = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cookie });

/** The `Cookie` header a jar would send back for the `Set-Cookie` an answer carried. */
const jarOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");

const signedOut = `${SESSION_COOKIE}=${SIGNED_OUT_VALUE}`;

describe("the auth mocks", () => {
  it("boot signed in as the mock user, and read the signed-out marker as nobody", async () => {
    expect(await (await call("/api/auth/get-session")).json()).toMatchObject({ user: MOCK_USER });
    expect(await (await call("/api/auth/get-session", { cookie: signedOut })).json()).toBeNull();
  });

  it("send a code to any address, and refuse the throttled one the way the rate limiter does", async () => {
    expect((await post("/api/auth/email-otp/send-verification-otp", { email: "anyone@example.com" })).status).toBe(200);
    const throttled = await post("/api/auth/email-otp/send-verification-otp", { email: THROTTLED_EMAIL });
    expect(throttled.status).toBe(429);
    expect(await throttled.json()).not.toHaveProperty("code");
  });

  it("sign in on the one code, as the address that was typed, with a cookie the probe reads back", async () => {
    const signedIn = await post("/api/auth/sign-in/email-otp", { email: "them@example.com", otp: MOCK_OTP }, signedOut);
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({ user: { email: "them@example.com" } });

    const probe = await (await call("/api/auth/get-session", { cookie: jarOf(signedIn) })).json();
    expect(probe).toMatchObject({ user: { ...MOCK_USER, email: "them@example.com" } });
  });

  it("refuse the magic codes in Better Auth's own envelopes, with its statuses", async () => {
    const expired = await post("/api/auth/sign-in/email-otp", { email: "a@example.com", otp: EXPIRED_OTP });
    expect(expired.status).toBe(400);
    expect(await expired.json()).toMatchObject({ code: "OTP_EXPIRED" });

    const spent = await post("/api/auth/sign-in/email-otp", { email: "a@example.com", otp: TOO_MANY_ATTEMPTS_OTP });
    expect(spent.status).toBe(403);
    expect(await spent.json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });

    const wrong = await post("/api/auth/sign-in/email-otp", { email: "a@example.com", otp: "99999" });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ code: "INVALID_OTP" });
    expect(wrong.headers.getSetCookie()).toEqual([]);
  });

  it("collapse a provider round-trip into its landing: the cookie, and the callback the client asked for", async () => {
    const social = await post("/api/auth/sign-in/social", { provider: "google", callbackURL: "/settings" });
    expect(await social.json()).toEqual({ url: "/settings", redirect: true });
    expect(await (await call("/api/auth/get-session", { cookie: jarOf(social) })).json()).toMatchObject({
      user: MOCK_USER,
    });

    expect((await post("/api/auth/sign-in/social", { provider: "facebook" })).status).toBe(400);
  });

  // The seam another module extends the mocked session through: it writes the cookie, and
  // the one `get-session` handler merges it — no competing handler for the same path.
  it("carry another module's session extras on the probe, with the session itself winning", async () => {
    const extra = sessionExtraCookie({ access: { plan: "Pro plan" }, user: "forged" }).split(";")[0];
    const probe = await (await call("/api/auth/get-session", { cookie: extra })).json();
    expect(probe).toMatchObject({ user: MOCK_USER, access: { plan: "Pro plan" } });

    // extras add fields; they never rewrite who is signed in, and never invent a session
    expect(await (await call("/api/auth/get-session", { cookie: `${extra}; ${signedOut}` })).json()).toBeNull();
  });

  it("sign out by leaving the marker, so a reload stays signed out", async () => {
    const out = await post("/api/auth/sign-out", {});
    expect(await out.json()).toEqual({ success: true });
    expect(jarOf(out)).toContain(SIGNED_OUT_VALUE);
    expect(await (await call("/api/auth/get-session", { cookie: jarOf(out) })).json()).toBeNull();
  });
});
