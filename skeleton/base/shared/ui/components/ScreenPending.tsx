import { motion } from "motion/react";

/**
 * The quiet wait — what the app shows while a route's data is in flight.
 *
 * It appears over an app the user is already in, so it says as little as possible — three
 * dots breathing on the canvas the screen it is standing in for will use. It navigates
 * nowhere and tags no screen; the router mounts and unmounts it, and its thresholds decide
 * whether it is seen at all.
 *
 * `<output>` rather than a div with `role="status"`: same role, and it is the element the
 * linter (and a screen reader) expects for a region that announces a changing state.
 */
const DOTS = [0, 1, 2];

export function ScreenPending() {
  return (
    <output
      aria-label="Loading"
      data-testid="screen-pending"
      className="bg-canvas fixed inset-0 flex items-center justify-center"
    >
      <div className="relative flex items-center gap-2">
        {DOTS.map((i) => (
          <motion.span
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-ink-brand"
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{
              duration: 1.2,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
              delay: i * 0.16,
            }}
          />
        ))}
      </div>
    </output>
  );
}
