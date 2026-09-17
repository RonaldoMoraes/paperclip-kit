import { describe, expect, it } from "vitest";
import { HttpError } from "../http";
import { EXAMPLE_FAILURE_COPY, ExampleFlowError, exampleFailure, exampleFailureReason } from "./errors";

describe("exampleFailure", () => {
  it("maps the feature's own condition to its own line and reason", () => {
    const failure = exampleFailure(new HttpError(404, "There is no item with that id.", "NOT_FOUND"));
    expect(failure).toBeInstanceOf(ExampleFlowError);
    expect(failure.reason).toBe("not-found");
    expect(failure.message).toBe(EXAMPLE_FAILURE_COPY["not-found"]);
  });

  it("falls through to the generic classification for everything else", () => {
    expect(exampleFailure(new HttpError(500, "boom")).reason).toBe("server");
    expect(exampleFailure(new TypeError("Failed to fetch")).reason).toBe("offline");
    expect(exampleFailure(new HttpError(409, "conflict")).reason).toBe("unknown");
    expect(exampleFailure("boom").reason).toBe("unknown");
  });

  it("passes an already-mapped failure through unchanged", () => {
    const mapped = new ExampleFlowError("custom", "server");
    expect(exampleFailure(mapped)).toBe(mapped);
    expect(exampleFailureReason(mapped)).toBe("server");
  });
});
