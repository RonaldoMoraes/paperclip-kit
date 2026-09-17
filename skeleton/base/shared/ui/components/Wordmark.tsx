import { cn } from "../cn";

/**
 * The product's name as its mark — plain text, so the skeleton ships no art. Replace the
 * body with the brand's SVG (as a CSS mask, so it takes any `text-*` token) when one
 * exists; keep the `role="img"` + label and the testid, which the shell and the e2e suite
 * read.
 */
export function Wordmark({ className, name = "__PRODUCT_NAME__" }: { className?: string; name?: string }) {
  return (
    <span
      role="img"
      aria-label={name}
      data-testid="wordmark"
      className={cn("inline-block font-semibold tracking-tight text-ink", className)}
    >
      {name}
    </span>
  );
}
