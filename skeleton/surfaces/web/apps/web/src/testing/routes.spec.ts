import { describe, expect, it } from "vitest";
import { KNOWN_ROUTES, readRoutePaths } from "./routes";

describe("KNOWN_ROUTES", () => {
  it("is every routed path, layouts and nesting resolved", () => {
    // Both halves of the tree: the index and the routes under the `_app` layout, whose own
    // pathless id must not show up as a path.
    expect(KNOWN_ROUTES).toContain("/");
    expect(KNOWN_ROUTES).toContain("/example");
    expect(KNOWN_ROUTES).toContain("/example/$id");
    expect(KNOWN_ROUTES).toContain("/settings");
    expect(KNOWN_ROUTES.some((path) => path.includes("_app"))).toBe(false);
  });
});

describe("readRoutePaths", () => {
  it("refuses a generated file it cannot read rather than answering with nothing", () => {
    expect(() => readRoutePaths("export const routeTree = {}")).toThrow(/routeTree.gen/);
  });
});
