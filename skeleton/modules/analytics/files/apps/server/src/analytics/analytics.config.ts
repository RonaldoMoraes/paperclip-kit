export type AnalyticsMode = "fake" | "real";

export type AnalyticsStoreConfig = { provider: "console" } | { provider: "mongo"; url: string; database: string };

export type AnalyticsConfig = { mode: AnalyticsMode; store: AnalyticsStoreConfig };

/** The database written to when `ANALYTICS_MONGODB_DB` names none: this product's own, never a shared one. */
export const DEFAULT_ANALYTICS_DATABASE = "__PRODUCT_SLUG__-analytics";

/**
 * The only reader of `process.env` for this domain, called inside the port's factory so
 * a missing key fails at boot and a spec that imports anything else reads none.
 *
 * Fake is the default in every environment: events landing on the wrong cluster are
 * worse than a missed metric, and mock-first development needs no MongoDB up. `real`
 * has to be asked for by name and refuses to start without a connection string; a key
 * that is set in fake mode is ignored — fake means nothing is stored.
 */
export function loadAnalyticsConfig(env: Record<string, string | undefined>): AnalyticsConfig {
  const mode = env.ANALYTICS_MODE?.trim() || "fake";
  if (mode !== "fake" && mode !== "real") {
    throw new Error(`[analytics] ANALYTICS_MODE must be "fake" or "real", got "${mode}".`);
  }
  if (mode === "fake") return { mode, store: { provider: "console" } };

  const url = env.ANALYTICS_MONGODB_URL?.trim() ?? "";
  if (url === "") {
    throw new Error(
      "[analytics] ANALYTICS_MODE=real but ANALYTICS_MONGODB_URL is missing. Set it or run with ANALYTICS_MODE=fake."
    );
  }
  return {
    mode,
    store: { provider: "mongo", url, database: env.ANALYTICS_MONGODB_DB?.trim() || DEFAULT_ANALYTICS_DATABASE },
  };
}
