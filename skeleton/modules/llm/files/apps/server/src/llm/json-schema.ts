import { type ZodType, z } from "zod";

/**
 * JSON Schema derived from a product Zod schema — Zod stays the single schema
 * source; adapters only ever see this plain-object derivation. The `$schema`
 * marker is stripped: vendors treat it as an unknown keyword.
 */
export function jsonSchemaOf(schema: ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/**
 * Whether a derived schema qualifies for OpenAI strict validation: a root
 * object whose every object node lists all properties as required and closes
 * with `additionalProperties: false` (Zod emits the latter for z.object).
 * Optional fields disqualify on purpose — strict mode would force them to
 * required-plus-nullable, and a model-emitted null then fails the Zod schema
 * that is the real contract.
 */
function isStrictCompatible(node: unknown, isRoot: boolean): boolean {
  if (typeof node !== "object" || node === null) return true;
  if (Array.isArray(node)) return node.every((item) => isStrictCompatible(item, false));

  const record = node as Record<string, unknown>;
  if (isRoot && record.type !== "object") return false;
  if (record.type === "object") {
    const properties = typeof record.properties === "object" && record.properties !== null ? record.properties : {};
    const required = Array.isArray(record.required) ? record.required : [];
    const allRequired = Object.keys(properties).every((key) => required.includes(key));
    if (!allRequired || record.additionalProperties !== false || "patternProperties" in record) return false;
  }
  return Object.values(record).every((value) => isStrictCompatible(value, false));
}

/**
 * The strict-mode derivation: the JSON Schema when it qualifies for OpenAI
 * strict validation, null when it does not (or Zod cannot represent it) — the
 * caller then keeps the plain-JSON validate/repair path.
 */
export function strictJsonSchemaOf(schema: ZodType): Record<string, unknown> | null {
  let derived: Record<string, unknown>;
  try {
    derived = jsonSchemaOf(schema);
  } catch {
    return null;
  }
  return isStrictCompatible(derived, true) ? derived : null;
}
