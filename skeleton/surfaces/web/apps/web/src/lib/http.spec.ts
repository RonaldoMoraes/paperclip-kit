import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpError } from "@contracts/http";
import { http } from "./http";

const Answer = z.object({ ok: z.boolean() });

function answering(status: number, body: unknown, init: { json?: boolean } = { json: true }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status < 400,
      status,
      json: async () => {
        if (init.json === false) throw new SyntaxError("Unexpected token < in JSON");
        return body;
      },
    }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the web app's Http", () => {
  it("reads a failure's code, message and issues off the envelope", async () => {
    answering(400, { code: "VALIDATION", message: "done is required.", issues: [{ path: ["done"] }] });

    const failure = await http.put("/api/example/items/x/done", Answer, {}).catch((error) => error);

    expect(failure).toBeInstanceOf(HttpError);
    expect(failure).toMatchObject({
      status: 400,
      message: "done is required.",
      code: "VALIDATION",
      issues: [{ path: ["done"] }],
    });
  });

  it("falls back to the status when the body is not the envelope", async () => {
    answering(502, "<html>Bad Gateway</html>", { json: false });

    const failure = (await http.get("/api/example/items", Answer).catch((error) => error)) as HttpError;

    expect(failure).toBeInstanceOf(HttpError);
    expect(failure.status).toBe(502);
    expect(failure.message).toBe("/api/example/items responded 502");
    expect(failure.code).toBeUndefined();
  });

  it("uses a message-only body as the failure, rather than the status line", async () => {
    answering(500, { message: "The upstream is unavailable." });

    const failure = (await http.get("/api/example/items", Answer).catch((error) => error)) as HttpError;

    expect(failure.message).toBe("The upstream is unavailable.");
    expect(failure.code).toBe("INTERNAL");
  });

  it("sends a body on every verb that takes one", async () => {
    answering(200, { ok: true });

    await http.put("/api/thing", Answer, { a: 1 });
    await http.patch("/api/thing", Answer, { a: 1 });
    await http.delete("/api/thing", Answer);

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.map(([, init]) => (init as RequestInit).method)).toEqual(["PUT", "PATCH", "DELETE"]);
    expect((calls[0][1] as RequestInit).body).toBe('{"a":1}');
    expect((calls[2][1] as RequestInit).body).toBeUndefined();
  });

  it("parses the answer through the contract's schema, so a drifted server fails here", async () => {
    answering(200, { ok: "yes" });

    await expect(http.get("/api/example/items", Answer)).rejects.toThrow();
  });
});
