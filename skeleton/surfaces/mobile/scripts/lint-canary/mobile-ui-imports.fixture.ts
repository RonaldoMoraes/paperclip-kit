// Deliberate violation for the lint-guard canary: a web-only shared/ui module and the web
// motion tokens imported from apps/mobile.
//
// `ScreenPending` is the one that has to stay web-only for this to prove anything — it
// renders an `<output>` with motion dots and has no `.native` twin. A shared component
// that gains one (`Button`, `Wordmark`) leaves the banned list, so it can never stand
// here: the day someone writes `ScreenPending.native.tsx`, this fixture is what has to be
// pointed at the next DOM-only component instead.
import { ScreenPending } from "@ui/components/ScreenPending";
import { springs } from "@ui/motion";

export const canary = [ScreenPending, springs];
