import { describe, expect, it } from "vitest";
import { UserIdError, userIdOf } from "./user-id";

describe("userIdOf", () => {
  it("reads the integer Better Auth hands out as a string", () => {
    expect(userIdOf({ user: { id: "42" } })).toBe(42);
    expect(userIdOf({ user: { id: 7 } })).toBe(7);
  });

  it("refuses anything that is not a database id", () => {
    expect(() => userIdOf({ user: { id: "usr_abc" } })).toThrow(UserIdError);
    expect(() => userIdOf({ user: { id: "0" } })).toThrow(UserIdError);
    expect(() => userIdOf({ user: { id: "4.5" } })).toThrow(UserIdError);
    expect(() => userIdOf({ user: { id: "" } })).toThrow(UserIdError);
  });
});
