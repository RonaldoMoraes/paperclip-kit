import type { Breadcrumb, Event, ReactNativeOptions } from "@sentry/react-native";
import * as Sentry from "@sentry/react-native";
import type { Boot } from "~/kit.types";

/**
 * Sentry on the phone, behind `EXPO_PUBLIC_SENTRY_DSN`. Metro inlines the DSN when it
 * transforms this file, so a binary built without one never initialises the SDK; with
 * one, `bootSentry` runs from `KIT_BOOT` before anything mounts. Errors only: no
 * performance tracing, no failed-request capture, no screenshots or view hierarchy, no
 * user identity. Everything an event or a breadcrumb carries passes the scrub below.
 *
 * The two `EXPO_PUBLIC_*` reads live here rather than in `src/lib/config.ts` because a
 * module cannot edit a surface file, and a second `biome.json` override cannot take this
 * file out of the surface's `expo-public-env.grit` scope (Biome adds plugins across
 * matching overrides, never subtracts) — so each read carries its suppression, and
 * nothing else reads them.
 *
 * The same scrub lives in `apps/web/src/lib/sentry.ts`: two apps, built separately.
 */

/** Keys whose value may carry what a person typed or was told: dropped before anything leaves the phone. */
const DROP_KEY = /preview|body|content|payload|cookie|header|authorization|secret|token|password|query/i;
const MAX_DEPTH = 6;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The DSN Metro inlined; null in every binary built without one. */
export function sentryDsn(): string | null {
  // biome-ignore lint/plugin: the one reader of EXPO_PUBLIC_SENTRY_DSN — a module cannot add it to the surface's config.ts
  return text(process.env.EXPO_PUBLIC_SENTRY_DSN);
}

/** `environment` on every event: `EXPO_PUBLIC_SENTRY_ENVIRONMENT`, or what the build is. */
export function sentryEnvironment(): string {
  // biome-ignore lint/plugin: the one reader of EXPO_PUBLIC_SENTRY_ENVIRONMENT, beside the DSN
  return text(process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT) ?? (__DEV__ ? "development" : "production");
}

/** A URL without what follows `?` or `#` — a query string is where an id or a token rides. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

function scrub(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH || seen.has(value)) return "[omitted]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (DROP_KEY.test(key)) continue;
    out[key] = key === "url" && typeof item === "string" ? stripQuery(item) : scrub(item, depth + 1, seen);
  }
  return out;
}

/** `fields` with every `DROP_KEY` key gone at any depth, every `url` cut at its query, cycles cut. */
export function scrubFields(fields: Record<string, unknown>): Record<string, unknown> {
  return scrub(fields, 0, new WeakSet()) as Record<string, unknown>;
}

/** A console line is dropped whole — whatever the app printed is in it; anything else is scrubbed. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.data === undefined) return breadcrumb;
  return { ...breadcrumb, data: scrubFields(breadcrumb.data) };
}

/** No user, and of the request only its URL (query cut) and method; extras and breadcrumbs scrubbed. */
export function scrubEvent<E extends Event>(event: E): E {
  const scrubbed: E = { ...event, user: undefined };
  if (event.request !== undefined) {
    scrubbed.request = {
      ...(event.request.url === undefined ? {} : { url: stripQuery(event.request.url) }),
      ...(event.request.method === undefined ? {} : { method: event.request.method }),
    };
  }
  if (event.breadcrumbs !== undefined) {
    scrubbed.breadcrumbs = event.breadcrumbs.flatMap((breadcrumb) => {
      const kept = scrubBreadcrumb(breadcrumb);
      return kept === null ? [] : [kept];
    });
  }
  if (event.extra !== undefined) scrubbed.extra = scrubFields(event.extra);
  return scrubbed;
}

export type SentryInput = { dsn: string; environment: string };

/**
 * PHI-safe by construction: no default PII, no tracing (so no app-start, stall or
 * interaction spans), no failed-request capture (a request body would ride along), no
 * screenshot and no view hierarchy on an error (the screen is the user's data). The
 * release and dist come from the native side (`bundleId@version+build`), and native
 * crash handling stays on — a native crash carries no app data.
 */
export function sentryInitOptions({ dsn, environment }: SentryInput): ReactNativeOptions {
  return {
    dsn,
    environment,
    sendDefaultPii: false,
    enableAutoPerformanceTracing: false,
    enableUserInteractionTracing: false,
    enableCaptureFailedRequests: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  };
}

/** `KIT_BOOT`: initialises the SDK when the binary carries a DSN. A failed init is a warning; the app opens. */
export const bootSentry: Boot = () => {
  const dsn = sentryDsn();
  if (dsn === null) return;
  try {
    Sentry.init(sentryInitOptions({ dsn, environment: sentryEnvironment() }));
  } catch (error) {
    console.warn("[sentry] init failed; errors stay in the console:", error);
  }
};
