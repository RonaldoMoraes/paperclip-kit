import { describe, expect, it } from "vitest";
import { diffCopy, flattenCopy, partitionDiff } from "./copy-diff.core";

describe("flattenCopy", () => {
  it("flattens nested sections to dot-path keys, arrays by index, and skips functions", () => {
    const flat = flattenCopy({
      SECTION: {
        title: "A title",
        nested: { line: "A line" },
        list: [{ label: "First" }, { label: "Second" }],
        helper: () => "not copy",
      },
    });
    expect(flat).toEqual({
      "SECTION.title": "A title",
      "SECTION.nested.line": "A line",
      "SECTION.list.0.label": "First",
      "SECTION.list.1.label": "Second",
    });
  });
});

describe("diffCopy", () => {
  it("splits keys into changed, missing in app and extra in app", () => {
    const diff = diffCopy(
      { same: "x", changed: "app words", appOnly: "extra" },
      { same: "x", changed: "reference words", referenceOnly: "missing" }
    );
    expect(diff.changed).toEqual([{ key: "changed", app: "app words", reference: "reference words" }]);
    expect(diff.missing).toEqual([{ key: "referenceOnly", reference: "missing" }]);
    expect(diff.extra).toEqual([{ key: "appOnly", app: "extra" }]);
  });
});

describe("partitionDiff", () => {
  it("absorbs allowlisted keys — the key itself and everything under its prefix — and keeps the rest blocking", () => {
    const diff = diffCopy(
      { "A.ruled": "app", "A.sub.deep": "app", "B.drifted": "app" },
      { "A.ruled": "reference", "A.sub.deep": "reference", "B.drifted": "reference", "C.pending": "reference" }
    );
    const { blocking, allowed } = partitionDiff(diff, [
      { prefix: "A", reason: "ruled divergence" },
      { prefix: "C.pending", reason: "not adopted yet" },
    ]);
    expect(allowed.map((entry) => entry.key).sort()).toEqual(["A.ruled", "A.sub.deep", "C.pending"]);
    expect(allowed.find((entry) => entry.key === "C.pending")?.kind).toBe("missing");
    expect(blocking.changed).toEqual([{ key: "B.drifted", app: "app", reference: "reference" }]);
    expect(blocking.missing).toEqual([]);
  });

  it("does not let a prefix match part of a key segment", () => {
    const diff = diffCopy({ ABC: "app" }, { ABC: "reference" });
    const { blocking } = partitionDiff(diff, [{ prefix: "AB", reason: "too short" }]);
    expect(blocking.changed).toHaveLength(1);
  });
});
