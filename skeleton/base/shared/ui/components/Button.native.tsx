import { type VariantProps, cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { Pressable, type PressableProps, Text } from "react-native";
import { cn } from "../cn";
import type { ButtonSize, ButtonVariant } from "./buttonVariants";

/**
 * The platform split of Button.tsx — same `variant`/`size` grammar, native primitives.
 *
 * Two cva recipes rather than one: a React Native View does not cascade text colour to
 * its children, so the label carries its own class for every variant.
 */
const container = cva("flex-row items-center justify-center gap-2.5 rounded-full", {
  variants: {
    variant: {
      primary: "bg-brand-strong",
      onDark: "bg-white",
      ink: "bg-ink",
      card: "border border-line bg-surface",
      ghost: "bg-transparent",
      ghostOnDark: "bg-transparent",
    } satisfies Record<ButtonVariant, string>,
    size: {
      md: "h-11 px-6",
      lg: "h-14 px-8",
    } satisfies Record<ButtonSize, string>,
  },
  defaultVariants: { variant: "primary", size: "md" },
});

/**
 * `shrink-0` keeps the label measured against its own glyphs rather than the row, and the
 * 1px of trailing padding absorbs the advance Android rounds off the last character of a
 * custom face. No `letterSpacing` reaches these sizes, which is the other half of the
 * same clip.
 */
const label = cva("shrink-0 pr-px text-center font-sans-semibold", {
  variants: {
    variant: {
      primary: "text-ondark",
      onDark: "text-ink",
      ink: "text-canvas",
      card: "text-ink",
      ghost: "text-ink-secondary",
      ghostOnDark: "text-ondark-muted",
    } satisfies Record<ButtonVariant, string>,
    size: {
      md: "text-[15px]",
      lg: "text-base",
    } satisfies Record<ButtonSize, string>,
  },
  defaultVariants: { variant: "primary", size: "md" },
});

type Props = Omit<PressableProps, "children" | "style"> &
  VariantProps<typeof container> & {
    /** A native Text node is mandatory — a bare string inside Pressable crashes on device. */
    children: string;
    className?: string;
    labelClassName?: string;
    /** rendered before the label, inside the row — an icon or a mark, never text */
    leading?: ReactNode;
  };

export function Button({ children, className, labelClassName, leading, variant, size, disabled, ...props }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      className={cn(container({ variant, size }), disabled && "opacity-40", className)}
      {...props}
    >
      {leading}
      <Text numberOfLines={1} className={cn(label({ variant, size }), labelClassName)}>
        {children}
      </Text>
    </Pressable>
  );
}
