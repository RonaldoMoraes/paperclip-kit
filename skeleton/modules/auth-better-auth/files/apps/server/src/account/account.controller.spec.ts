import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { AccountController } from "./account.controller";

const deleteUser = vi.fn();
const auth = { api: { deleteUser: (input: unknown) => deleteUser(input) } } as never;

const session = {
  session: { id: "1", userId: "42", token: "t", expiresAt: new Date() },
  user: { id: "42", email: "someone@example.com", name: "Someone", emailVerified: true },
} as never;

describe("AccountController", () => {
  it("answers the signed-in user off the session the guard resolved", () => {
    expect(new AccountController(auth).me(session)).toEqual({
      id: "42",
      email: "someone@example.com",
      name: "Someone",
      emailVerified: true,
    });
  });

  it("deletes through Better Auth and forwards the cookie that clears the session", async () => {
    const headers = new Headers();
    headers.append("set-cookie", "__COOKIE_PREFIX__.session_token=; Max-Age=0; Path=/");
    deleteUser.mockResolvedValue({ headers, response: { success: true } });
    const res = { setHeader: vi.fn() };
    const req = { headers: { cookie: "__COOKIE_PREFIX__.session_token=t" } };

    const answer = await new AccountController(auth).remove(req as never, res as never);

    expect(answer).toEqual({ deleted: true });
    expect(deleteUser).toHaveBeenCalledWith(expect.objectContaining({ body: {}, returnHeaders: true }));
    expect(res.setHeader).toHaveBeenCalledWith("set-cookie", ["__COOKIE_PREFIX__.session_token=; Max-Age=0; Path=/"]);
  });

  it("sets no cookie header when Better Auth cleared none", async () => {
    deleteUser.mockResolvedValue({ headers: new Headers(), response: { success: true } });
    const res = { setHeader: vi.fn() };

    await new AccountController(auth).remove({ headers: {} } as never, res as never);

    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
