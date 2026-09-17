import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@contracts/http";
import { queryClient } from "~/lib/queryClient";
import { sessionKey } from "~/lib/session";
import { settingsActions } from "./settingsActions";

const signOut = vi.fn();
const del = vi.fn();
const navigate = vi.fn();

vi.mock("~/lib/auth", () => ({ authClient: { signOut: () => signOut() } }));
vi.mock("~/lib/http", () => ({ http: { delete: (...args: unknown[]) => del(...args) } }));
vi.mock("~/app/router", () => ({ router: { navigate: (options: unknown) => navigate(options) } }));

const action = (id: string) => {
  const found = settingsActions.find((entry) => entry.id === id);
  if (!found) throw new Error(`no settings action ${id}`);
  return found;
};

describe("the account rows on Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    queryClient.setQueryData(sessionKey, { user: { id: "1" } });
    queryClient.setQueryData(["example", "items"], { items: [] });
    signOut.mockResolvedValue({ error: null });
    del.mockResolvedValue({ deleted: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists sign out then delete, the destructive one marked", () => {
    expect(settingsActions.map(({ id, tone }) => ({ id, tone }))).toEqual([
      { id: "sign-out", tone: undefined },
      { id: "delete-account", tone: "danger" },
    ]);
  });

  // Everything cached belonged to the person who left: the session reads as nobody, the
  // feature caches are gone, and the router goes to sign-in.
  it("signs out through the auth client, forgets everything cached and goes to sign-in", async () => {
    await action("sign-out").run();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(sessionKey)).toBeNull();
    expect(queryClient.getQueryData(["example", "items"])).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith({ to: "/account", replace: true });
  });

  it("keeps the session when the server refuses the sign-out, and names it", async () => {
    signOut.mockResolvedValue({ error: { message: "Session store unavailable" } });

    await expect(action("sign-out").run()).rejects.toMatchObject({ message: "Session store unavailable" });

    expect(navigate).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(sessionKey)).toEqual({ user: { id: "1" } });
  });

  it("deletes the account only once confirmed, through the contract's endpoint, then leaves", async () => {
    await action("delete-account").run();

    expect(del).toHaveBeenCalledWith("/api/account", expect.anything());
    expect(navigate).toHaveBeenCalledWith({ to: "/account", replace: true });
  });

  it("does nothing when the confirmation is declined", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);

    await action("delete-account").run();

    expect(del).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("stays put when the server refuses the deletion", async () => {
    del.mockRejectedValue(new HttpError(403, "Sign in again, then delete your account.", "FORBIDDEN"));

    await expect(action("delete-account").run()).rejects.toBeInstanceOf(HttpError);

    expect(navigate).not.toHaveBeenCalled();
  });
});
