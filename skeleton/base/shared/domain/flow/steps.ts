/**
 * The shapes a flow's steps come in. Data only: a renderer maps each `kind` to its own
 * component, and the engine (`flow.ts`) reads only `id` and `options` off them.
 */

export type SelectOption = {
  label: string;
  sub?: string;
  /**
   * What the answer is WORTH when the flow scores it. Without it the value is the
   * position in this list, counting from 1 — declare it whenever the two differ.
   */
  value?: number;
};

/** One answer from a fixed list; the renderer auto-advances after the tap. */
export type SelectStep = {
  kind: "select";
  id: string;
  topic: string;
  prompt: string;
  hint?: string;
  options: SelectOption[];
};

export type MultiOption = { id: string; label: string };

/** Any number of answers, confirmed by the bar; `none` is the opt-out row when the question has one. */
export type MultiStep = {
  kind: "multi";
  id: string;
  topic: string;
  prompt: string;
  hint?: string;
  options: MultiOption[];
  none?: string;
};

/** A screen of words between questions, with one call to action. */
export type NarrativeStep = {
  kind: "narrative";
  id: string;
  title: string;
  body: string;
  cta: string;
};

export type Step = SelectStep | MultiStep | NarrativeStep;

/** The declared value of an answer, or its one-based position when none was declared. */
export function scoreOf(step: SelectStep, index: number): number {
  return step.options[index]?.value ?? index + 1;
}
