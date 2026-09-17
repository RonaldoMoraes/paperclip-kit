import { useMutation } from "@tanstack/react-query";
import { failureCopy } from "@contracts/http-errors";
import { KIT_SETTINGS_ACTIONS } from "~/kit.gen";
import type { SettingsAction } from "~/kit.types";

/** A row as the screen reads it: the work stays here, behind `run(id)`. */
export type SettingsActionView = Pick<SettingsAction, "id" | "label" | "tone">;

/**
 * The modules' Settings rows (`KIT_SETTINGS_ACTIONS`), run one at a time. A mutation
 * rather than local state so an action that talks to the server behaves like every other
 * write on the phone — it runs offline and fails loudly (`networkMode: "always"`), and its
 * failure is a line from the shared taxonomy.
 */
export function useSettingsActions(): {
  actions: SettingsActionView[];
  run: (id: string) => void;
  /** the id of the action in flight, or null */
  pending: string | null;
  error: string | null;
} {
  const { mutate, isPending, variables, error } = useMutation({
    mutationKey: ["settings", "action"],
    mutationFn: async (id: string) => {
      await KIT_SETTINGS_ACTIONS.find((action) => action.id === id)?.run();
    },
  });

  return {
    actions: KIT_SETTINGS_ACTIONS.map(({ id, label, tone }) => ({ id, label, tone })),
    run: (id) => {
      if (!isPending) mutate(id);
    },
    pending: isPending ? (variables ?? null) : null,
    error: error ? failureCopy(error) : null,
  };
}
