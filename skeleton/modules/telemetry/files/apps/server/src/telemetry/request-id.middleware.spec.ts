import { describe, expect, it, vi } from "vitest";
import { currentRequestId } from "./request-context";
import { REQUEST_ID_HEADER, RequestIdMiddleware, readRequestId } from "./request-id.middleware";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const call = (header?: string | string[]) => {
  const setHeader = vi.fn();
  let inContext: string | undefined;
  new RequestIdMiddleware().use({ headers: { [REQUEST_ID_HEADER]: header } }, { setHeader }, () => {
    inContext = currentRequestId();
  });
  return { echoed: setHeader.mock.calls[0]?.[1] as string, inContext };
};

describe("RequestIdMiddleware", () => {
  it("echoes the id the caller sent, on the answer and in the request context", () => {
    expect(call("gw-7f3a")).toEqual({ echoed: "gw-7f3a", inContext: "gw-7f3a" });
  });

  it("mints a uuid v4 when none came, and the header and the context agree", () => {
    const { echoed, inContext } = call();
    expect(echoed).toMatch(UUID_V4);
    expect(inContext).toBe(echoed);
    expect(call().echoed).not.toBe(echoed);
  });

  it("mints rather than echo an id it would not want on a log line", () => {
    for (const bad of ["", "  ", "has space", "new\nline", "a".repeat(129), ["one", "two"]]) {
      expect(call(bad).echoed).toMatch(UUID_V4);
    }
  });

  it("leaves no context behind once the chain returns", () => {
    call("gw-1");
    expect(currentRequestId()).toBeUndefined();
  });
});

describe("readRequestId", () => {
  it("accepts one trimmed token and nothing else", () => {
    expect(readRequestId(" req_1.2:3-4 ")).toBe("req_1.2:3-4");
    expect(readRequestId("-leading")).toBeUndefined();
    expect(readRequestId(["a"])).toBeUndefined();
    expect(readRequestId(undefined)).toBeUndefined();
  });
});
