// Deliberate violation for the lint-guard canary: domain code throwing a bare Error.
export function failBarely(): never {
  throw new Error("bare");
}
