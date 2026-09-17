import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, parseApiError } from "./errors";

describe("parseApiError", () => {
  it("reads the envelope a failed call answers with", () => {
    expect(parseApiError({ code: "VALIDATION", message: "Body is not valid.", issues: [{ path: ["done"] }] })).toEqual({
      code: "VALIDATION",
      message: "Body is not valid.",
      issues: [{ path: ["done"] }],
    });
  });

  it("keeps an envelope without issues", () => {
    expect(parseApiError({ code: "UNAUTHORIZED", message: "Sign in first." })).toEqual({
      code: "UNAUTHORIZED",
      message: "Sign in first.",
    });
  });

  it("answers null for a body that is not one, so the caller falls back to the status", () => {
    expect(parseApiError(null)).toBeNull();
    expect(parseApiError("<html>502 Bad Gateway</html>")).toBeNull();
    expect(parseApiError({ statusCode: 401, message: "Unauthorized" })).toBeNull();
    expect(parseApiError({ code: 401, message: "Unauthorized" })).toBeNull();
  });
});

describe("API_ERROR_CODES", () => {
  it("is the six generic conditions and names no feature", () => {
    expect([...API_ERROR_CODES]).toEqual([
      "VALIDATION",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "INTERNAL",
    ]);
  });
});
