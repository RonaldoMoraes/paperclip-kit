import { describe, expect, it } from "vitest";
import { REDACTED, describeError, redactCredentials, scrubForSentry, stripQuery } from "./scrub";

describe("scrubForSentry", () => {
  it("drops a body, a preview or a credential wherever it sits, and keeps the identifiers around it", () => {
    const scrubbed = scrubForSentry({
      requestId: "req-1",
      path: "/api/example/items/a",
      requestBody: { note: "my blood pressure is" },
      response: { status: 500, contentPreview: "raw model output", headers: { cookie: "s=1" } },
      list: [{ token: "t", id: 7 }],
    });
    expect(scrubbed).toEqual({
      requestId: "req-1",
      path: "/api/example/items/a",
      response: { status: 500 },
      list: [{ id: 7 }],
    });
    expect(JSON.stringify(scrubbed)).not.toMatch(/blood|raw model|s=1|"t"/);
  });

  it("describes an error and survives a cycle", () => {
    const loop: Record<string, unknown> = { id: 1 };
    loop.self = loop;
    expect(scrubForSentry({ cause: new TypeError("bad"), loop })).toEqual({
      cause: { name: "TypeError", message: "bad", stack: expect.any(String) },
      loop: { id: 1, self: "[omitted]" },
    });
  });
});

describe("redactCredentials", () => {
  it("keeps the key and loses the value, at any depth", () => {
    expect(redactCredentials({ path: "/x", authorization: "Bearer y", nested: { apiToken: "z" } })).toEqual({
      path: "/x",
      authorization: REDACTED,
      nested: { apiToken: REDACTED },
    });
  });
});

describe("stripQuery / describeError", () => {
  it("cuts a URL at its query or fragment and describes a non-error", () => {
    expect(stripQuery("/api/items?id=7#top")).toBe("/api/items");
    expect(stripQuery("/api/items")).toBe("/api/items");
    expect(describeError("boom")).toEqual({ name: "NonError", message: "boom" });
  });
});
