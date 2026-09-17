import { BROWSING, CLOSING_STEP, FLOW_ID, GOAL_STEP, TOPICS_ID, topicsStepFor } from "./sample";
import type { MultiStep, NarrativeStep, SelectStep } from "./steps";

/**
 * A multi-step flow as a pure state machine. Each app wraps it in a hook and owns only
 * what is platform: the auto-advance timer, scrolling, navigation out, and the components
 * per step. `buildItems` and `finishFlow` are the product's two functions; everything else
 * is the engine and reads nothing but ids off the items.
 */

export type FlowItem =
  | { kind: "select"; step: SelectStep }
  | { kind: "multi"; step: MultiStep }
  | { kind: "narrative"; step: NarrativeStep };

/** The one id every item has, whatever its kind — what deep links, tags and `stepIndex` key on. */
export function idOf(item: FlowItem): string {
  return item.step.id;
}

/* ── the product's list ───────────────────────────────────────────────────── */

/**
 * Built from the state on every read, so a decision that changes the list moves every
 * later step and a deep link resolves against the list the renderer walks. Never cache
 * the result across an action: an index is only meaningful against the list its state builds.
 */
export function buildItems(state: Pick<FlowState, "answers">): FlowItem[] {
  const goal = state.answers[GOAL_STEP.id];
  return [
    { kind: "select", step: GOAL_STEP },
    // the second question is asked only of someone with a goal to focus
    ...(goal === BROWSING ? [] : [{ kind: "multi", step: topicsStepFor(goal) } satisfies FlowItem]),
    { kind: "narrative", step: CLOSING_STEP },
  ];
}

/**
 * Every step a deep link may name. A route's search schema validates against this list,
 * so a link that names anything else resolves to the start of the flow.
 */
export const FLOW_STEPS = [GOAL_STEP.id, TOPICS_ID, CLOSING_STEP.id] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

export function isFlowStep(value: string | undefined): value is FlowStep {
  return FLOW_STEPS.some((step) => step === value);
}

/** Where a deep link asks the flow to open — validated by the route that carries it. */
export type FlowLink = { step: FlowStep | null };

/**
 * Where a `?step=` deep link starts: matched on ids, never a hand-kept index. Answers
 * before it are NOT reconstructed — inventing them would put words in the person's mouth;
 * a step whose branch was never taken resolves to the start.
 */
export function stepIndex(items: FlowItem[], step: FlowStep | null): number {
  if (!step) return 0;
  const index = items.findIndex((item) => idOf(item) === step);
  return index < 0 ? 0 : index;
}

/* ── the state, and what changes it ─────────────────────────────────────────── */

export type FlowState = {
  /** the position in the list `buildItems` produces for this state */
  index: number;
  /** single-answer steps: step id → option index */
  answers: Record<string, number>;
  /** every multi-select's picks by step id — one shape, so two multi-selects cannot disagree on "selected" */
  multi: Record<string, string[]>;
  none: Record<string, boolean>;
  /** the option just tapped on a select step, held for the auto-advance beat */
  picked: number | null;
};

export type FlowAction =
  | { type: "advance" }
  | { type: "back" }
  | { type: "select"; stepId: string; value: number }
  | { type: "toggle-multi"; stepId: string; optionId: string }
  | { type: "choose-none"; stepId: string };

const EMPTY: Omit<FlowState, "index"> = { answers: {}, multi: {}, none: {}, picked: null };

/** The starting state a link produces. */
export function initialFlowState(link: FlowLink): FlowState {
  return { ...EMPTY, index: stepIndex(buildItems(EMPTY), link.step) };
}

export function reduceFlow(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "advance": {
      const last = buildItems(state).length - 1;
      if (state.index >= last && state.picked === null) return state;
      return { ...state, picked: null, index: Math.min(state.index + 1, last) };
    }
    case "back":
      // the first screen has nothing behind it in the flow; leaving is the renderer's call
      return state.index === 0 ? state : { ...state, picked: null, index: state.index - 1 };
    case "select":
      // a second tap during the auto-advance beat is the same answer, not a new one
      if (state.picked !== null) return state;
      return { ...state, picked: action.value, answers: { ...state.answers, [action.stepId]: action.value } };
    case "toggle-multi": {
      const on = state.multi[action.stepId] ?? [];
      return {
        ...state,
        none: { ...state.none, [action.stepId]: false },
        multi: {
          ...state.multi,
          [action.stepId]: on.includes(action.optionId)
            ? on.filter((id) => id !== action.optionId)
            : [...on, action.optionId],
        },
      };
    }
    case "choose-none":
      return {
        ...state,
        multi: { ...state.multi, [action.stepId]: [] },
        none: { ...state.none, [action.stepId]: true },
      };
  }
}

/* ── what a renderer reads ───────────────────────────────────────────────────── */

/** what the fixed bar says on the steps that carry one */
export type FlowBar = { label: string; enabled: boolean };

export type FlowView = {
  /** the step being rendered */
  item: FlowItem;
  /** 0..1, for the progress rail */
  progress: number;
  /** the step counter, one-based, and how many steps this state produced */
  position: number;
  total: number;
  /** the step's tag — the screen tag and the analytics step, which name the step rather than the route */
  tag: string;
  bar: FlowBar | null;
};

/** Which kinds carry the fixed bar, and what it says. A select has none: the tap is the answer. */
function barOf(item: FlowItem, state: FlowState): FlowBar | null {
  switch (item.kind) {
    case "multi":
      return {
        label: "Continue",
        enabled: (state.multi[item.step.id]?.length ?? 0) > 0 || state.none[item.step.id] === true,
      };
    case "narrative":
      return { label: item.step.cta, enabled: true };
    default:
      return null;
  }
}

export function viewOf(state: FlowState): FlowView {
  const items = buildItems(state);
  // clamped: an answer can shorten the list under an index taken against the longer one
  const index = Math.min(state.index, items.length - 1);
  const item = items[index];
  return {
    item,
    progress: (index + 1) / items.length,
    position: index + 1,
    total: items.length,
    tag: `${FLOW_ID}:${idOf(item)}`,
    bar: barOf(item, state),
  };
}

/* ── the end ─────────────────────────────────────────────────────────────────── */

/** What the sample walk produces: the goal's label and the topics ticked, if any were asked. */
export type FlowResult = {
  goal: string;
  topics: string[];
};

export function finishFlow(state: FlowState): FlowResult {
  return {
    goal: GOAL_STEP.options[state.answers[GOAL_STEP.id] ?? 0]?.label ?? "",
    topics: state.multi[TOPICS_ID] ?? [],
  };
}
