import { describe, expect, it } from "vitest";
import { HttpError } from "./http";
import { FAILURE_COPY, failureCopy, failureReason } from "./http-errors";

const failing = (status: number) => new HttpError(status, `/api/example/items responded ${status}`);

describe("failureReason", () => {
  it("names the statuses a person can act on", () => {
    expect(failureReason(failing(401))).toBe("unauthorized");
    expect(failureReason(failing(403))).toBe("refused");
    expect(failureReason(failing(404))).toBe("not-found");
    expect(failureReason(failing(409))).toBe("conflict");
    expect(failureReason(failing(429))).toBe("throttle");
  });

  it("reads every 5xx as the server's, whether or not it carried an envelope", () => {
    expect(failureReason(failing(500))).toBe("server");
    expect(failureReason(new HttpError(503, "Service Unavailable", "INTERNAL"))).toBe("server");
  });

  it("reads a 4xx this client should not have sent as unknown, not as a condition", () => {
    expect(failureReason(failing(400))).toBe("unknown");
    expect(failureReason(failing(422))).toBe("unknown");
  });

  it("reads a request that never reached the server as offline", () => {
    expect(failureReason(new TypeError("Network request failed"))).toBe("offline");
  });

  it("reads anything this package did not throw as unknown", () => {
    expect(failureReason(new Error("boom"))).toBe("unknown");
    expect(failureReason("boom")).toBe("unknown");
    expect(failureReason(null)).toBe("unknown");
  });
});

describe("failureCopy", () => {
  it("answers with the reason's line, so no caller maps a failure twice", () => {
    expect(failureCopy(failing(404))).toBe(FAILURE_COPY["not-found"]);
    expect(failureCopy(undefined)).toBe(FAILURE_COPY.unknown);
  });
});
