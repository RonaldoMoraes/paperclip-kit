import { type AnyFormApi, type DeepKeys, type FormApi, useStore } from "@tanstack/react-form";

/**
 * What a form field is complaining about, as a line a person can read.
 *
 * TanStack Form hands back whatever its validator produced: a Zod issue from the contract
 * schemas, a bare string from a hand-written validator. Anything else is left silent rather
 * than rendered as `[object Object]` where the sentence belongs.
 */
export function fieldComplaint(errors: unknown[]): string | null {
  const first = errors[0];
  if (typeof first === "string") return first;
  return first && typeof first === "object" && "message" in first ? String(first.message) : null;
}

/**
 * Any form, narrowed only by the shape of its values — enough for `name` to be checked
 * against the fields the form actually has, so a typo fails to compile.
 */
// biome-ignore lint/suspicious/noExplicitAny: TanStack's form generics are twelve deep; the values are the only one these helpers read.
type FormOf<TValues> = FormApi<TValues, any, any, any, any, any, any, any, any, any, any, any>;

/** The field's complaint, re-read whenever the field changes. */
export function useFieldComplaint<TValues>(form: FormOf<TValues>, name: DeepKeys<TValues>): string | null {
  return useStore(form.store, (state) => fieldComplaint(state.fieldMeta[name]?.errors ?? []));
}

/**
 * Drop a field's complaint while keeping what was typed — for a screen that walks the user
 * to a door that line does not belong to. Both maps go: the errors and the record of which
 * validator raised them, which the form reads back together.
 */
export function clearFieldComplaint<TValues>(form: FormOf<TValues>, name: DeepKeys<TValues>): void {
  (form as AnyFormApi).setFieldMeta(name, (meta) => ({ ...meta, errorMap: {}, errorSourceMap: {} }));
}
