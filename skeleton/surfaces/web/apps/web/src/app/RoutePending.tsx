import { ScreenPending } from "@ui/components/ScreenPending";

/**
 * The one pending component every route uses. In base there is one kind of wait — a
 * route's data in flight — and the dots say "a moment" and get out of the way.
 *
 * A module that adds a cold wait (a session gate deciding whether to let the user in at
 * all) branches here: hold the brand when the session is still unknown, the dots once it
 * is. Read that from the query cache as a snapshot, never a subscription — the decision
 * belongs to the pending episode that mounted this component.
 */
export function RoutePending() {
  return <ScreenPending />;
}
