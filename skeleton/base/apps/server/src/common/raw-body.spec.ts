import { describe, expect, it } from "vitest";
import { isRawBodyPath, parseBodyExcept } from "./raw-body";

const WEBHOOK = "/api/billing/webhook";

describe("parseBodyExcept", () => {
  it("parses every path the list does not name", () => {
    const parsed: string[] = [];
    const middleware = parseBodyExcept<{ path: string }, unknown>(
      (req, _res, next) => {
        parsed.push(req.path);
        next();
      },
      [WEBHOOK]
    );
    let passed = false;

    middleware({ path: "/api/example/items" }, {}, () => {
      passed = true;
    });

    expect(parsed).toEqual(["/api/example/items"]);
    expect(passed).toBe(true);
  });

  it("passes a raw path along without touching it, so the handler reads the socket", () => {
    let parsed = false;
    const middleware = parseBodyExcept<{ path: string; body?: unknown }, unknown>(() => {
      parsed = true;
    }, [WEBHOOK]);
    const request = { path: WEBHOOK };
    let passed = false;

    middleware(request, {}, () => {
      passed = true;
    });

    expect(parsed).toBe(false);
    expect(passed).toBe(true);
    expect(request).not.toHaveProperty("body");
  });

  it("parses everything when nothing asked to stay raw — the base tree", () => {
    let parsed = false;
    parseBodyExcept<{ path: string }, unknown>(() => {
      parsed = true;
    }, [])({ path: WEBHOOK }, {}, () => {});
    expect(parsed).toBe(true);
  });
});

describe("isRawBodyPath", () => {
  it("matches the whole path and nothing under or beside it", () => {
    expect(isRawBodyPath(WEBHOOK, [WEBHOOK])).toBe(true);
    expect(isRawBodyPath(`${WEBHOOK}/extra`, [WEBHOOK])).toBe(false);
    expect(isRawBodyPath("/api/billing", [WEBHOOK])).toBe(false);
  });
});
