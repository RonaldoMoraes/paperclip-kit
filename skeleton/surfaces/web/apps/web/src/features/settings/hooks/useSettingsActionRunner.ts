import { useState } from "react";
import { failureCopy } from "@contracts/http-errors";
import type { SettingsAction } from "~/app/kit.types";

/**
 * Running a module's Settings row: which one is in flight, and the line to show when one
 * refuses. The rows themselves are the route's — `KIT_SETTINGS_ACTIONS` reaches the
 * screen as a prop — so this hook holds no list, only what happens when one is tapped.
 *
 * It exists because the failure has to be said in words and the screen may not import the
 * taxonomy that has them (`server-state-boundary`): a module's `run()` rejects with
 * whatever its own transport threw, the classification happens once here, and the screen
 * takes a string it only renders.
 */
type SettingsActionRunner = {
  /** run one row; the screen holds every row while `running` is set */
  run: (action: SettingsAction) => Promise<void>;
  /** the id of the row in flight, or null */
  running: string | null;
  /** the line for the row that failed, cleared by the next run */
  error: string | null;
};

export function useSettingsActionRunner(): SettingsActionRunner {
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: SettingsAction) => {
    setRunning(action.id);
    setError(null);
    try {
      await action.run();
    } catch (failure) {
      setError(failureCopy(failure));
    } finally {
      setRunning(null);
    }
  };

  return { run, running, error };
}
