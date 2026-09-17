import type { Breadcrumb, BrowserOptions, Event } from "@sentry/react";
import * as Sentry from "@sentry/react";
import type { Boot } from "~/app/kit.types";
import { APP_VERSION } from "~/lib/version";

/**
 * Sentry on the web, behind `VITE_SENTRY_DSN`. Vite inlines the DSN at build time, so a
 * bundle built without one never initialises the SDK and never talks to Sentry; with one,
 * `bootSentry` runs from `KIT_BOOT` before the first render and `SentryBoundary` wraps the
 * router. Errors only: no tracing, no replay, no user identity. Everything an event or a
 * breadcrumb carries passes the scrub below, and the SDK's own collection is off.
 *
 * The same scrub lives in `apps/mobile/src/lib/sentry.ts`: two apps, built separately.
 */

/** Keys whose value may carry what a person typed or was told: dropped before anything leaves the browser. */
const DROP_KEY = /preview|body|content|payload|cookie|header|authorization|secret|token|password|query/i;
const MAX_DEPTH = 6;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The DSN the build inlined; null in every bundle built without one. */
export function sentryDsn(): string | null {
  return text(import.meta.env.VITE_SENTRY_DSN);
}

/** `environment` on every event: `VITE_SENTRY_ENVIRONMENT`, or the mode the bundle was built in. */
export function sentryEnvironment(): string {
  return text(import.meta.env.VITE_SENTRY_ENVIRONMENT) ?? import.meta.env.MODE;
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

export type SentryInput = { dsn: string; environment: string; release: string };

/**
 * PHI-safe by construction: no user info, cookies, headers, query strings or bodies
 * collected by the SDK; no `tracesSampleRate` (no performance spans, which carry URLs and
 * timings the product did not ask to ship); no replay integration (a session recording is
 * the screen, and the screen is the user's data). What is left is the error, its stack,
 * the route and the device.
 */
export function sentryInitOptions({ dsn, environment, release }: SentryInput): BrowserOptions {
  return {
    dsn,
    environment,
    release,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  };
}

/** `KIT_BOOT`: initialises the SDK when the build carries a DSN. A failed init is a warning; the app opens. */
export const bootSentry: Boot = () => {
  const dsn = sentryDsn();
  if (dsn === null) return;
  try {
    Sentry.init(sentryInitOptions({ dsn, environment: sentryEnvironment(), release: `__PRODUCT_SLUG__@${APP_VERSION}` }));
  } catch (error) {
    console.warn("[sentry] init failed; errors stay in the console:", error);
  }
};
