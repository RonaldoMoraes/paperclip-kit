import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { SETTINGS_COPY, fill } from "@domain/copy";
import { cn } from "@ui/cn";
import type { SettingsAction } from "~/app/kit.types";
import { useSettingsActionRunner } from "~/features/settings/hooks/useSettingsActionRunner";
import { Screen } from "~/features/shell/components/Screen";
import { TAB_BAR_PAD } from "~/features/shell/components/TabBar";
import { riseIn, staggerEnter } from "~/lib/motion";

/**
 * Settings — the quiet part of the product. One row per action a module contributed
 * (`KIT_SETTINGS_ACTIONS`: sign out, manage billing, delete the account…) in the order the
 * scaffold listed them, and the version at the foot. The screen owns how a row looks, that
 * a running one cannot be tapped twice, and where a refusal stands; what a row does — and
 * what its failure reads as — is the module's, behind `useSettingsActionRunner`.
 */
type Props = {
  version: string;
  actions: SettingsAction[];
};

const C = SETTINGS_COPY;

export function Settings({ version, actions }: Props) {
  // which action is running (a second tap while it runs would run it twice), and the line
  // for the last one that refused — both the runner's, so the screen only renders them
  const { run, running, error } = useSettingsActionRunner();

  return (
    <Screen tag="settings" className={cn("px-5 pt-20", TAB_BAR_PAD)} enter={staggerEnter()}>
      <motion.h1 variants={riseIn} data-testid="settings-title" className="mb-6 font-serif text-display-2 text-ink">
        {C.title}
      </motion.h1>

      <motion.section
        variants={riseIn}
        data-testid="settings-actions"
        className="card divide-y divide-line-subtle overflow-hidden rounded-sheet"
      >
        {actions.length === 0 ? (
          <p data-testid="settings-no-actions" className="px-5 py-4 text-sm text-ink-secondary">
            {C.noActions}
          </p>
        ) : (
          actions.map((action) => (
            <button
              key={action.id}
              type="button"
              data-testid={`settings-action-${action.id}`}
              data-tone={action.tone ?? "default"}
              disabled={running !== null}
              onClick={() => run(action)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-150 ease-brand hover:bg-surface-subtle disabled:opacity-60"
            >
              <span
                className={cn("flex-1 text-[15px] font-medium", action.tone === "danger" ? "text-error" : "text-ink")}
              >
                {action.label}
              </span>
              <ChevronRight size={16} className="shrink-0 text-ink-tertiary" />
            </button>
          ))
        )}
      </motion.section>

      {error ? (
        <motion.p
          variants={riseIn}
          role="alert"
          data-testid="settings-action-error"
          className="mt-4 text-center text-sm text-error"
        >
          {error}
        </motion.p>
      ) : null}

      <motion.p
        variants={riseIn}
        data-testid="settings-version"
        className="tnum mt-8 text-center text-xs text-ink-tertiary"
      >
        {fill(C.version, { version })}
      </motion.p>
    </Screen>
  );
}
