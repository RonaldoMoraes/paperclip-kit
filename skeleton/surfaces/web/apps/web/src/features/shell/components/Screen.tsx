import { type MotionProps, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@ui/cn";
import { pageEnter } from "~/lib/motion";
import { useScreenTag } from "~/lib/useScreenTag";

/**
 * The frame every screen sits in: the field, the column main runs in, the enter animation
 * and the screen tag. A screen renders through this and never repeats the block — every
 * difference between screens is one of the props below.
 */
type Props = {
  /** what the e2e suite reads back as the screen's identity */
  tag: string;
  children: ReactNode;
  /** the light canvas, or the immersive full-bleed */
  variant?: "field" | "dark";
  /** main sits in the middle of the viewport rather than flowing from the top */
  center?: boolean;
  /** main's own padding — the shell owns its width and centring */
  className?: string;
  /** how it arrives — one of the enters in `lib/motion` */
  enter?: MotionProps;
  /** what the enter plays on: main, the whole screen (chrome included), or nothing */
  enterOn?: "main" | "screen" | "none";
  /** sticky chrome above main, inside the field */
  chrome?: ReactNode;
  /** the fixed action bar, below main, inside the field */
  bar?: ReactNode;
};

export function Screen({
  tag,
  children,
  variant = "field",
  center = false,
  className,
  enter = pageEnter,
  enterOn = "main",
  chrome,
  bar,
}: Props) {
  useScreenTag(tag);
  const onScreen = enterOn === "screen" ? enter : {};
  const onMain = enterOn === "main" ? enter : {};

  return (
    <motion.div
      {...onScreen}
      className={cn(
        variant === "dark" ? "bg-immersive fixed inset-0 overflow-y-auto text-ondark" : "bg-canvas relative min-h-dvh",
        center && "flex items-center justify-center px-6"
      )}
    >
      {chrome}
      <motion.main {...onMain} className={cn("relative mx-auto w-full max-w-md", className)}>
        {children}
      </motion.main>
      {bar}
    </motion.div>
  );
}
