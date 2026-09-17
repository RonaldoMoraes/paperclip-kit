import { motion, useScroll, useTransform } from "motion/react";
import { Wordmark } from "@ui/components/Wordmark";

/** the scroll distance over which the top bar's material fully arrives */
export const TOP_BAR_FADE_PX = 64;

/**
 * The bar has no material until there is content behind it to separate from — 0 at the top
 * of the page, fully in once `TOP_BAR_FADE_PX` of content has passed under it.
 */
export function topBarMaterialOpacity(scrollY: number): number {
  return Math.min(Math.max(scrollY / TOP_BAR_FADE_PX, 0), 1);
}

/**
 * The top bar: the wordmark and nothing else — chrome stays quiet. `pointer-events-none`
 * on the frame so the invisible bar never swallows a tap on the content under it.
 */
export function TopBar() {
  const { scrollY } = useScroll();
  const material = useTransform(scrollY, topBarMaterialOpacity);

  return (
    <header data-testid="top-bar" className="pointer-events-none fixed inset-x-0 top-0 z-20">
      <motion.div
        aria-hidden
        data-testid="top-bar-material"
        style={{ opacity: material }}
        className="chrome absolute inset-0"
      />
      <div className="relative mx-auto flex h-14 w-full max-w-md items-center justify-between px-5 pt-safe-top">
        <Wordmark className="text-[15px]" />
      </div>
    </header>
  );
}
