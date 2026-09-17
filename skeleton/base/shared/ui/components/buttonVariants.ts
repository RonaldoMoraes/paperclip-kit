/**
 * The button grammar, declared once for both platforms.
 *
 * `Button.tsx` and `Button.native.tsx` own their own classes — a DOM button and a
 * Pressable style nothing alike — but they answer to the same names. Each cva map is
 * `satisfies Record<ButtonVariant, string>` / `Record<ButtonSize, string>`, so a variant
 * added on one platform and not the other fails to compile rather than rendering as the
 * default on a device nobody opened.
 *
 * The union lives in its own module rather than in `Button.tsx`: that keeps the web
 * file's DOM-typed props out of the mobile type graph, and a runtime import of `./Button`
 * from the native file would resolve to itself under Metro.
 */

export type ButtonVariant = "primary" | "onDark" | "ink" | "card" | "ghost" | "ghostOnDark";

export type ButtonSize = "md" | "lg";
