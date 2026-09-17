import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SETTINGS_COPY, fill } from "@domain/copy";
import { cn } from "@ui/cn";
import type { SettingsActionView } from "~/features/settings/hooks/useSettingsActions";
import { ScreenHeader } from "~/features/shell/components/ScreenHeader";
import { TAB_BAR_PAD } from "~/features/shell/components/TabBar";
import { ChevronRightIcon } from "~/lib/icons";

/**
 * Settings — the quiet part of the product. One row per action a module contributed
 * (`KIT_SETTINGS_ACTIONS`: sign out, manage a plan, delete the account) in the order the
 * scaffold listed them, and the version at the foot, which a bug report quotes. The
 * screen owns how a row looks and that a running one cannot be tapped twice; what a row
 * does is the module's, behind `onRun`. Handles are the web's: `settings-<element>`,
 * `settings-action-<id>`.
 */
type Props = {
  /** the modules' rows, in manifest order */
  actions: SettingsActionView[];
  /** `1.2.0 (34)` — from `~/lib/version` */
  version: string;
  onRun: (id: string) => void;
  /** the id of the row in flight; every row waits while one runs */
  pending: string | null;
  error: string | null;
};

const C = SETTINGS_COPY;

export function Settings({ actions, version, onRun, pending, error }: Props) {
  return (
    <ScrollView testID="settings" className="flex-1 bg-canvas" contentContainerClassName={`px-6 pt-16 ${TAB_BAR_PAD}`}>
      <ScreenHeader title={C.title} testID="settings-title" />

      <View testID="settings-actions" className="overflow-hidden rounded-sheet border border-line bg-surface">
        {actions.length === 0 ? (
          <Text testID="settings-no-actions" className="px-5 py-4 font-sans text-sm text-ink-secondary">
            {C.noActions}
          </Text>
        ) : (
          actions.map((action, index) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              aria-busy={pending === action.id}
              disabled={pending !== null}
              onPress={() => onRun(action.id)}
              testID={`settings-action-${action.id}`}
              className={cn(
                "flex-row items-center gap-3 px-5 py-4",
                index > 0 && "border-line-subtle border-t",
                pending !== null && "opacity-60"
              )}
            >
              <Text
                className={cn(
                  "flex-1 font-sans-medium text-base",
                  action.tone === "danger" ? "text-error" : "text-ink"
                )}
              >
                {action.label}
              </Text>
              {pending === action.id ? (
                <ActivityIndicator />
              ) : (
                <ChevronRightIcon size={16} className="text-ink-tertiary" />
              )}
            </Pressable>
          ))
        )}
      </View>

      {error ? (
        <Text
          accessibilityRole="alert"
          testID="settings-error"
          className="mt-4 text-center font-sans text-sm text-error"
        >
          {error}
        </Text>
      ) : null}

      <Text testID="settings-version" className="mt-8 text-center font-sans text-xs text-ink-tertiary">
        {fill(C.version, { version })}
      </Text>
    </ScrollView>
  );
}
