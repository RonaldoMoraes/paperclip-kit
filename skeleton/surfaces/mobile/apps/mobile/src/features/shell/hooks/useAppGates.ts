import { KIT_GATES } from "~/kit.gen";
import type { GateResult } from "~/kit.types";

/**
 * Every module's gate, read as one answer. The root layout guards the app group on
 * `allow` and brings the splash down on `ready`; `index` follows `redirectTo`.
 *
 * Each gate is a hook. The list is fixed when the bundle is built (`kit.gen.tsx`), so
 * calling them in a loop keeps the same order on every render — the rule of hooks holds
 * without each being named here. With no gate, the app is open and ready at once.
 */
export function useAppGates(): GateResult {
  const answers = KIT_GATES.map((gate) => gate());

  return {
    ready: answers.every((answer) => answer.ready),
    allow: answers.every((answer) => answer.allow),
    redirectTo: answers.find((answer) => answer.redirectTo !== undefined)?.redirectTo,
  };
}
