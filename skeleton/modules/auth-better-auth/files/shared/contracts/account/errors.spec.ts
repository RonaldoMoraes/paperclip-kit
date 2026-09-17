import { describe, expect, it } from "vitest";
import { HttpError } from "../http";
import { ACCOUNT_FAILURE_COPY, AccountFlowError, accountFailure, accountFailureReason } from "./errors";

describe("accountFailure", () => {
  it("maps the feature's own condition — a session too old to delete on — to its own line", () => {
    const failure = accountFailure(new HttpError(403, "Sign in again, then delete your account.", "FORBIDDEN"));
    expect(failure).toBeInstanceOf(AccountFlowError);
    expect(failure.reason).toBe("stale-session");
    expect(failure.message).toBe(ACCOUNT_FAILURE_COPY["stale-session"]);
  });

  it("falls through to the generic classification for everything else", () => {
    expect(accountFailure(new HttpError(401, "Sign in first.", "UNAUTHORIZED")).reason).toBe("unauthorized");
    expect(accountFailure(new HttpError(500, "boom")).reason).toBe("server");
    expect(accountFailure(new TypeError("Failed to fetch")).reason).toBe("offline");
    expect(accountFailure("boom").reason).toBe("unknown");
  });

  it("passes an already-mapped failure through unchanged", () => {
    const mapped = new AccountFlowError("custom", "server");
    expect(accountFailure(mapped)).toBe(mapped);
    expect(accountFailureReason(mapped)).toBe("server");
  });
});
