import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpError } from "@contracts/http";
import { addRequestHeaders, http } from "./http";

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

const lastInit = () => (vi.mocked(fetch).mock.calls[0]?.[1] ?? {}) as RequestInit;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the app's Http", () => {
  it("reads a failure's code, message and issues off the envelope", async () => {
    answering(403, { code: "FORBIDDEN", message: "That isn't yours." });

    const failure = await http.get("/api/check", Answer).catch((error) => error);

    expect(failure).toBeInstanceOf(HttpError);
    expect(failure).toMatchObject({ status: 403, message: "That isn't yours.", code: "FORBIDDEN" });
  });

  it("falls back to the status when the body is not the envelope", async () => {
    answering(502, "<html>Bad Gateway</html>", { json: false });

    const failure = (await http.get("/api/check", Answer).catch((error) => error)) as HttpError;

    expect(failure).toBeInstanceOf(HttpError);
    expect(failure.status).toBe(502);
    expect(failure.message).toBe("/api/check responded 502");
    expect(failure.code).toBeUndefined();
  });

  it("uses a message-only body as the failure, rather than the status line", async () => {
    answering(500, { message: "The upstream is unavailable." });

    const failure = (await http.get("/api/check", Answer).catch((error) => error)) as HttpError;

    expect(failure.message).toBe("The upstream is unavailable.");
    expect(failure.code).toBe("INTERNAL");
  });

  // A native fetch has no jar: what a module registers is the whole of what travels, and
  // it is read per request so a session that lands after the first call is carried by the next.
  it("carries the headers a module registers, until the module takes them back", async () => {
    answering(200, { ok: true });
    const remove = addRequestHeaders(() => ({ Cookie: "session=t" }));

    await http.get("/api/check", Answer);
    expect(lastInit().headers).toMatchObject({ Cookie: "session=t" });

    remove();
    vi.mocked(fetch).mockClear();
    await http.get("/api/check", Answer);
    expect(lastInit().headers).not.toHaveProperty("Cookie");
  });

  // Whatever a module sets is the whole session: leaving the default in place lets the
  // platform's own credential handling send a jar this code never filled.
  it("sends no credentials of the platform's own", async () => {
    answering(200, { ok: true });

    await http.get("/api/check", Answer);

    expect(lastInit().credentials).toBe("omit");
  });

  // A server that has drifted from the contract fails here, at the transport, rather than
  // as a missing field inside a screen that has no way to say what went wrong.
  it("refuses a body the contract does not describe", async () => {
    answering(200, { ok: "yes" });

    const failure = await http.get("/api/check", Answer).catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(HttpError);
  });

  it("sends a body on every verb that takes one", async () => {
    answering(200, { ok: true });

    await http.put("/api/thing", Answer, { a: 1 });
    await http.patch("/api/thing", Answer, { a: 1 });
    await http.delete("/api/thing", Answer);

    const inits = vi.mocked(fetch).mock.calls.map(([, init]) => init as RequestInit);
    expect(inits.map((init) => init.method)).toEqual(["PUT", "PATCH", "DELETE"]);
    expect(inits.map((init) => init.body)).toEqual(['{"a":1}', '{"a":1}', undefined]);
  });
});
