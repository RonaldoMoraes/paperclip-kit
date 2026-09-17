import { APIError } from "better-auth/api";
import { describe, expect, it, vi } from "vitest";
import { MeResponse } from "@contracts/account/me";
import { ApiException } from "../common/api-error";
import { type AccountAuth, deleteAccount, readMe } from "./account.service";

const session = {
  session: { id: "1", userId: "42", token: "t", expiresAt: new Date() },
  user: { id: "42", email: "someone@example.com", name: "Someone", emailVerified: true, createdAt: new Date() },
} as never;

describe("readMe", () => {
  it("answers the contract's narrow user and nothing Better Auth adds", () => {
    const me = readMe(session);
    expect(me).toEqual({ id: "42", email: "someone@example.com", name: "Someone", emailVerified: true });
    expect(MeResponse.parse(me)).toEqual(me);
  });

  it("reads an unnamed user as null, never as an empty string", () => {
    expect(readMe({ ...session, user: { ...session.user, name: "" } }).name).toBeNull();
  });
});

/** Better Auth's delete endpoint as three closures: what it was handed, and what it answers. */
function stubAuth(outcome: { setCookie?: string[]; throws?: unknown } = {}): AccountAuth & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    deleteUser: async (input) => {
      calls.push(input);
      if (outcome.throws) throw outcome.throws;
      const headers = new Headers();
      for (const line of outcome.setCookie ?? []) headers.append("set-cookie", line);
      return { headers, response: { success: true } };
    },
  };
}

describe("deleteAccount", () => {
  it("deletes through Better Auth with the caller's headers and forwards the cleared cookie", async () => {
    const auth = stubAuth({ setCookie: ["acme-notes.session_token=; Max-Age=0; Path=/"] });
    const headers = new Headers({ cookie: "acme-notes.session_token=t" });

    const answer = await deleteAccount({ auth }, headers);

    expect(answer.body).toEqual({ deleted: true });
    expect(answer.setCookie).toEqual(["acme-notes.session_token=; Max-Age=0; Path=/"]);
    expect(auth.calls[0]).toMatchObject({ headers, body: {}, returnHeaders: true });
  });

  // An email-code user has no password to show, so Better Auth asks for a fresh session
  // instead; a stale one is told to sign in again, in the envelope, not shown a failure.
  it("answers a stale session as FORBIDDEN with the line to act on", async () => {
    const auth = stubAuth({
      throws: new APIError("BAD_REQUEST", { message: "Session expired. Re-authenticate to perform this action." }),
    });

    const failure = deleteAccount({ auth }, new Headers());

    await expect(failure).rejects.toBeInstanceOf(ApiException);
    await expect(failure).rejects.toMatchObject({ response: { code: "FORBIDDEN", message: /Sign in again/ } });
  });

  it("keeps any other refusal's status in the envelope", async () => {
    const auth = stubAuth({ throws: new APIError("UNAUTHORIZED", { message: "no session" }) });

    await expect(deleteAccount({ auth }, new Headers())).rejects.toMatchObject({
      status: 401,
      response: { code: "UNAUTHORIZED" },
    });
  });

  it("lets a failure that is not Better Auth's through untouched — a bug is a bug", async () => {
    const boom = new TypeError("database gone");
    const auth = stubAuth({ throws: boom });

    await expect(deleteAccount({ auth }, new Headers())).rejects.toBe(boom);
  });
});

describe("the stub", () => {
  it("is honest about what it records", async () => {
    const auth = stubAuth();
    const spy = vi.spyOn(auth, "deleteUser");
    await deleteAccount({ auth }, new Headers());
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
