import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildRepairMessages, cleanJsonResponse, validateStructuredResponse } from "./json-output";

describe("cleanJsonResponse", () => {
  it("passes clean JSON through untouched", () => {
    expect(cleanJsonResponse('{"a":1}')).toBe('{"a":1}');
    expect(cleanJsonResponse("[1,2,3]")).toBe("[1,2,3]");
  });

  it("strips ```json fences", () => {
    expect(cleanJsonResponse('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips bare ``` fences", () => {
    expect(cleanJsonResponse('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts the first object block from surrounding prose", () => {
    expect(cleanJsonResponse('Here is the JSON you asked for: {"a":1} — hope that helps!')).toBe('{"a":1}');
  });

  it("extracts an array block from surrounding prose", () => {
    expect(cleanJsonResponse("The result is [1,2,3] as requested.")).toBe("[1,2,3]");
  });

  it("keeps nested structures intact by cutting at the last closing bracket", () => {
    expect(cleanJsonResponse('prefix {"a":{"b":[1,2]}} suffix')).toBe('{"a":{"b":[1,2]}}');
  });

  it("returns trimmed content when no JSON block is present", () => {
    expect(cleanJsonResponse("  no json here  ")).toBe("no json here");
  });
});

describe("buildRepairMessages", () => {
  const original = [
    { role: "system" as const, content: "Answer as JSON." },
    { role: "user" as const, content: "Score this note." },
  ];

  it("opens with the repair system prompt", () => {
    const [system] = buildRepairMessages(original, "not json", { kind: "invalid-json", detail: "Unexpected token" });
    expect(system.role).toBe("system");
    expect(system.content).toContain("You repair malformed LLM outputs into valid structured JSON.");
    expect(system.content).toContain("Return only JSON.");
  });

  it("carries the original messages, the invalid output, the failure kind and the details", () => {
    const messages = buildRepairMessages(original, '{"score": "high"}', {
      kind: "schema-mismatch",
      detail: '[{"path":["score"],"message":"Expected number"}]',
    });
    expect(messages).toHaveLength(2);
    const user = messages[1];
    expect(user.role).toBe("user");
    expect(user.content).toContain(JSON.stringify(original, null, 2));
    expect(user.content).toContain('{"score": "high"}');
    expect(user.content).toContain("schema-mismatch");
    expect(user.content).toContain('"Expected number"');
    expect(user.content).toContain("Return only corrected JSON.");
  });
});

describe("validateStructuredResponse", () => {
  const schema = z.object({ score: z.number() });

  it("returns the parsed value and the cleaned text for a valid fenced response", () => {
    const result = validateStructuredResponse('```json\n{"score":7}\n```', schema);
    expect(result).toEqual({ ok: true, value: { score: 7 }, cleaned: '{"score":7}' });
  });

  it("classifies unparseable content as invalid-json", () => {
    const result = validateStructuredResponse("not json", schema);
    if (result.ok) throw new Error("expected a failure");
    expect(result.failure.kind).toBe("invalid-json");
    expect(result.cleaned).toBe("not json");
  });

  it("classifies a schema violation as schema-mismatch with the Zod issues", () => {
    const result = validateStructuredResponse('{"score":"high"}', schema);
    if (result.ok) throw new Error("expected a failure");
    expect(result.failure.kind).toBe("schema-mismatch");
    expect(result.failure.detail).toContain("score");
  });

  it("classifies empty and null responses", () => {
    const empty = validateStructuredResponse("   ", schema);
    if (empty.ok) throw new Error("expected a failure");
    expect(empty.failure.kind).toBe("empty-response");
    const nul = validateStructuredResponse("null", schema);
    if (nul.ok) throw new Error("expected a failure");
    expect(nul.failure.kind).toBe("empty-json");
  });
});
