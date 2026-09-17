import { describe, expect, it } from "vitest";
import { SessionNotResolvedError, sessionFromRequest } from "./session.decorator";

describe("sessionFromRequest", () => {
  it("hands back what the guard left on the request", () => {
    const session = { session: { id: "1" }, user: { id: "1", email: "someone@example.com" } } as never;
    expect(sessionFromRequest({ headers: {}, session })).toBe(session);
  });

  // A route that reads the session without the guard has nothing to read: that is a wiring
  // bug named as one, never an anonymous caller.
  it("names a route that forgot the guard", () => {
    expect(() => sessionFromRequest({ headers: {} })).toThrow(SessionNotResolvedError);
  });
});
