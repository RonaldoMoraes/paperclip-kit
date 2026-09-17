import type { AllowRule } from "./copy-diff.core";

/**
 * The `copy:diff` allowlist: every key (or section prefix) where `@domain/copy` and the
 * reference are ALLOWED to disagree today, each with the reason. A diff on any key not
 * covered here fails the run — that is the gate. Shrinking this file is the adoption: a
 * section lands in `@domain/copy` → its "not adopted yet" rule comes out; a divergence
 * gets resolved (the reference wins) → its rule comes out.
 *
 * Keep rules as narrow as the case allows — a broad prefix also swallows the next
 * reference edit to that section, which is exactly what this tool exists to surface.
 * Group rules by why they exist; these are the shapes that recur:
 *
 *   // a reference section the app has not adopted yet
 *   { prefix: "CHECKOUT_COPY", reason: "checkout ships next; not adopted yet" },
 *   // strings the app alone needs, homed in a `*_APP_COPY` section beside the feature
 *   { prefix: "EXAMPLE_APP_COPY", reason: "app-only example strings (failure states the design never drew)" },
 *   // copy the app keeps as data or code rather than under the reference's keys
 *   { prefix: "PLAN_COPY.tiers.list", reason: "tier names are contract data (shared/contracts/plan/tiers.ts)" },
 *   // a temporary hold on a ruled key — never a permanent fork; name why the adoption has not landed
 *   { prefix: "SHELL_COPY.error.retry", reason: "hold — wording under review, decision 004" },
 */
export const ALLOW_RULES: AllowRule[] = [];
