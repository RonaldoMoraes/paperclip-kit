import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../cn";
import type { ButtonSize, ButtonVariant } from "./buttonVariants";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-full font-sans font-semibold",
    "transition-colors duration-150 ease-brand",
    "disabled:pointer-events-none disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        // the primary CTA is the deep, near-black pill
        primary: "bg-brand-strong text-ondark hover:bg-brand",
        onDark: "bg-white text-ink hover:bg-surface-subtle",
        // ink and card hover by scale, not tint, so the variant's transition-transform
        // overrides the base transition-colors. The ink label is canvas rather than white:
        // ink flips to near-white in the dark scheme, and canvas flips with it.
        ink: "bg-ink text-canvas transition-transform hover:scale-[1.01] active:scale-[0.99]",
        card: "card text-ink transition-transform hover:scale-[1.01] active:scale-[0.99]",
        ghost: "bg-transparent text-ink-secondary hover:text-ink",
        ghostOnDark: "bg-transparent text-ondark-muted hover:text-ondark",
      } satisfies Record<ButtonVariant, string>,
      size: {
        md: "h-11 px-6 text-[15px]",
        lg: "h-14 px-8 text-base",
      } satisfies Record<ButtonSize, string>,
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

type Props = React.ComponentProps<"button"> & VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: Props) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
