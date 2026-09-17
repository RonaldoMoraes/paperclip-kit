import { describe, expect, it } from "vitest";
import {
  FLOW_STEPS,
  type FlowAction,
  type FlowState,
  buildItems,
  finishFlow,
  idOf,
  initialFlowState,
  isFlowStep,
  reduceFlow,
  stepIndex,
  viewOf,
} from "./flow";
import { BROWSING, CLOSING_STEP, GOAL_STEP, TOPICS_ID } from "./sample";
import { scoreOf } from "./steps";

const NO_LINK = { step: null };

/** run the actions in order, the way a renderer dispatches them */
function run(state: FlowState, ...actions: FlowAction[]): FlowState {
  return actions.reduce(reduceFlow, state);
}

/** answer a select step and let the auto-advance beat pass */
const answer = (stepId: string, value: number): FlowAction[] => [
  { type: "select", stepId, value },
  { type: "advance" },
];

const ids = (state: FlowState) => buildItems(state).map(idOf);

describe("buildItems", () => {
  it("opens on the goal, closes on the narrative, and asks the topics in between", () => {
    expect(ids(initialFlowState(NO_LINK))).toEqual([GOAL_STEP.id, TOPICS_ID, CLOSING_STEP.id]);
  });

  it("drops the topics for someone just looking — a branch moves every later step", () => {
    const browsing = run(initialFlowState(NO_LINK), { type: "select", stepId: GOAL_STEP.id, value: BROWSING });
    expect(ids(browsing)).toEqual([GOAL_STEP.id, CLOSING_STEP.id]);
  });

  it("builds the topics from the goal picked, so the second question follows the first", () => {
    const habit = run(initialFlowState(NO_LINK), { type: "select", stepId: GOAL_STEP.id, value: 1 });
    const item = buildItems(habit)[1];
    expect(item.kind === "multi" && item.step.options.map((o) => o.id)).toEqual(["move", "sleep", "focus"]);
  });
});

describe("stepIndex", () => {
  it("resolves every step a deep link may name, and unknown or absent to the start", () => {
    const items = buildItems(initialFlowState(NO_LINK));
    for (const step of FLOW_STEPS) expect(idOf(items[stepIndex(items, step)])).toBe(step);
    expect(stepIndex(items, null)).toBe(0);
  });

  it("points a link at a step only when the branch that holds it was taken", () => {
    const browsing = run(initialFlowState(NO_LINK), { type: "select", stepId: GOAL_STEP.id, value: BROWSING });
    expect(stepIndex(buildItems(browsing), TOPICS_ID)).toBe(0);
  });

  it("isFlowStep is the route's guard", () => {
    expect(isFlowStep(TOPICS_ID)).toBe(true);
    expect(isFlowStep("nowhere")).toBe(false);
    expect(isFlowStep(undefined)).toBe(false);
  });
});

describe("initialFlowState", () => {
  it("opens on the first step with nothing answered when there is no link", () => {
    const state = initialFlowState(NO_LINK);
    expect(state.index).toBe(0);
    expect(viewOf(state).item).toMatchObject({ kind: "select", step: { id: GOAL_STEP.id } });
  });

  it("lands on the linked step without inventing the answers before it", () => {
    const state = initialFlowState({ step: TOPICS_ID });
    expect(viewOf(state).item).toMatchObject({ kind: "multi", step: { id: TOPICS_ID } });
    expect(state.answers).toEqual({});
  });
});

describe("reduceFlow", () => {
  it("holds the picked option through the beat and ignores a second tap until advance clears it", () => {
    const state = run(initialFlowState(NO_LINK), { type: "select", stepId: GOAL_STEP.id, value: 1 });
    expect(state.picked).toBe(1);
    const again = reduceFlow(state, { type: "select", stepId: GOAL_STEP.id, value: 0 });
    expect(again.answers[GOAL_STEP.id]).toBe(1);
    const advanced = reduceFlow(again, { type: "advance" });
    expect(advanced.picked).toBeNull();
    expect(advanced.index).toBe(1);
  });

  it("never advances past the last step and never backs past the first", () => {
    const start = initialFlowState(NO_LINK);
    expect(reduceFlow(start, { type: "back" })).toBe(start);
    const last = initialFlowState({ step: CLOSING_STEP.id });
    expect(reduceFlow(last, { type: "advance" })).toBe(last);
  });

  it("a multi-select and its opt-out are exclusive: ticking clears none, none clears the ticks", () => {
    let state = run(initialFlowState({ step: TOPICS_ID }), {
      type: "toggle-multi",
      stepId: TOPICS_ID,
      optionId: "work",
    });
    expect(viewOf(state).bar).toEqual({ label: "Continue", enabled: true });
    state = reduceFlow(state, { type: "choose-none", stepId: TOPICS_ID });
    expect(state.multi[TOPICS_ID]).toEqual([]);
    expect(state.none[TOPICS_ID]).toBe(true);
    state = reduceFlow(state, { type: "toggle-multi", stepId: TOPICS_ID, optionId: "home" });
    expect(state.none[TOPICS_ID]).toBe(false);
    expect(state.multi[TOPICS_ID]).toEqual(["home"]);
  });

  it("a second toggle of the same option un-ticks it", () => {
    const state = run(
      initialFlowState({ step: TOPICS_ID }),
      { type: "toggle-multi", stepId: TOPICS_ID, optionId: "work" },
      { type: "toggle-multi", stepId: TOPICS_ID, optionId: "work" }
    );
    expect(state.multi[TOPICS_ID]).toEqual([]);
    expect(viewOf(state).bar).toEqual({ label: "Continue", enabled: false });
  });
});

describe("viewOf", () => {
  it("counts against the list this state produced, so a branch changes the total", () => {
    const asked = run(initialFlowState(NO_LINK), ...answer(GOAL_STEP.id, 0));
    expect(viewOf(asked)).toMatchObject({ position: 2, total: 3 });
    const skipped = run(initialFlowState(NO_LINK), ...answer(GOAL_STEP.id, BROWSING));
    expect(viewOf(skipped)).toMatchObject({ position: 2, total: 2, item: { kind: "narrative" } });
    expect(viewOf(skipped).progress).toBe(1);
  });

  it("names the step, not the route, and gives a select no bar", () => {
    expect(viewOf(initialFlowState(NO_LINK))).toMatchObject({ tag: "sample:goal", bar: null });
    expect(viewOf(initialFlowState({ step: TOPICS_ID })).tag).toBe("sample:topics");
    expect(viewOf(initialFlowState({ step: CLOSING_STEP.id })).bar).toEqual({ label: CLOSING_STEP.cta, enabled: true });
  });

  it("clamps an index the list has shrunk under", () => {
    const deep = { ...initialFlowState({ step: CLOSING_STEP.id }), answers: { [GOAL_STEP.id]: BROWSING } };
    expect(viewOf(deep).item).toMatchObject({ kind: "narrative" });
  });
});

describe("finishFlow", () => {
  it("turns the walk into the goal's label and the topics ticked", () => {
    const state = run(
      initialFlowState(NO_LINK),
      ...answer(GOAL_STEP.id, 1),
      { type: "toggle-multi", stepId: TOPICS_ID, optionId: "sleep" },
      { type: "toggle-multi", stepId: TOPICS_ID, optionId: "focus" },
      { type: "advance" }
    );
    expect(finishFlow(state)).toEqual({ goal: "Build a habit", topics: ["sleep", "focus"] });
  });

  it("answers no topics for the branch that never asked", () => {
    const state = run(initialFlowState(NO_LINK), ...answer(GOAL_STEP.id, BROWSING));
    expect(finishFlow(state)).toEqual({ goal: "Just looking", topics: [] });
  });
});

describe("scoreOf", () => {
  it("reads the declared value, or the one-based position when none was declared", () => {
    expect(scoreOf(GOAL_STEP, 1)).toBe(2);
    expect(
      scoreOf(
        {
          ...GOAL_STEP,
          options: [
            { label: "a", value: 0 },
            { label: "b", value: 5 },
          ],
        },
        1
      )
    ).toBe(5);
    expect(scoreOf({ ...GOAL_STEP, options: [{ label: "a", value: 0 }] }, 0)).toBe(0);
  });
});
