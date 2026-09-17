import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonSchemaOf, strictJsonSchemaOf } from "./json-schema";

describe("jsonSchemaOf", () => {
  it("derives a plain JSON Schema object and strips the $schema marker", () => {
    const derived = jsonSchemaOf(z.object({ score: z.number(), label: z.string() }));
    expect(derived).toEqual({
      type: "object",
      properties: { score: { type: "number" }, label: { type: "string" } },
      required: ["score", "label"],
      additionalProperties: false,
    });
    expect("$schema" in derived).toBe(false);
  });

  it("keeps optional fields out of required — the Zod schema stays the one source", () => {
    const derived = jsonSchemaOf(z.object({ chat: z.string(), note: z.string().optional() }));
    expect(derived.required).toEqual(["chat"]);
    expect(Object.keys(derived.properties as Record<string, unknown>)).toEqual(["chat", "note"]);
  });
});

describe("strictJsonSchemaOf", () => {
  it("returns the derivation for an all-required object tree", () => {
    const schema = z.object({
      score: z.number(),
      nested: z.object({ label: z.string() }),
      items: z.array(z.object({ id: z.number() })),
    });
    expect(strictJsonSchemaOf(schema)).toEqual(jsonSchemaOf(schema));
  });

  it("returns null when any object carries an optional field — strict mode would force it nullable", () => {
    expect(strictJsonSchemaOf(z.object({ chat: z.string(), note: z.string().optional() }))).toBeNull();
    expect(strictJsonSchemaOf(z.object({ outer: z.object({ inner: z.number().optional() }) }))).toBeNull();
  });

  it("returns null for open objects — strict mode demands additionalProperties: false", () => {
    expect(strictJsonSchemaOf(z.record(z.string(), z.number()))).toBeNull();
  });

  it("returns null for a non-object root — vendors reject bare arrays and scalars in strict mode", () => {
    expect(strictJsonSchemaOf(z.array(z.object({ id: z.number() })))).toBeNull();
    expect(strictJsonSchemaOf(z.string())).toBeNull();
  });
});
