import type { MultiOption, MultiStep, NarrativeStep, SelectStep } from "./steps";

/**
 * The sample flow's steps — two questions and a closing screen, enough to show a branch.
 *
 * The second question depends on the first: its options follow the goal picked, and one
 * goal skips it entirely, so the list `buildItems` produces changes length as the person
 * answers. A real flow replaces this file and the two functions in `flow.ts` that read it
 * (`buildItems`, `finishFlow`); the engine around them stays.
 */

export const FLOW_ID = "sample";

export const GOAL_STEP: SelectStep = {
  kind: "select",
  id: "goal",
  topic: "Start here",
  prompt: "What brings you here?",
  hint: "Pick the one that fits best. You can change it later.",
  options: [{ label: "Get organised" }, { label: "Build a habit" }, { label: "Just looking" }],
};

/** The option index that skips the second question: someone just looking is not asked what for. */
export const BROWSING = 2;

const TOPICS_BY_GOAL: MultiOption[][] = [
  [
    { id: "work", label: "Work" },
    { id: "home", label: "Home" },
    { id: "money", label: "Money" },
  ],
  [
    { id: "move", label: "Moving more" },
    { id: "sleep", label: "Sleeping better" },
    { id: "focus", label: "Staying focused" },
  ],
];

export const TOPICS_ID = "topics";

/** Built per goal: the options follow the answer before, which is why the list is rebuilt from state. */
export function topicsStepFor(goal: number | undefined): MultiStep {
  return {
    kind: "multi",
    id: TOPICS_ID,
    topic: "Focus",
    prompt: "Which of these matter most right now?",
    hint: "Choose all that apply.",
    options: TOPICS_BY_GOAL[goal ?? 0] ?? TOPICS_BY_GOAL[0],
    none: "None of these",
  };
}

export const CLOSING_STEP: NarrativeStep = {
  kind: "narrative",
  id: "closing",
  title: "That's it.",
  body: "Everything you picked can be changed from settings.",
  cta: "Finish",
};
