import type { Breadcrumb, Event, NodeOptions } from "@sentry/nestjs";
import * as Sentry from "@sentry/nestjs";
import type { SentryConfig } from "./observability.config";
import { scrubForSentry, stripQuery } from "./scrub";

/**
 * A breadcrumb before it is kept: a console line is dropped whole (whatever a domain
 * printed is in it), anything else loses its dropped keys and its query strings.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.data === undefined) return breadcrumb;
  const data = scrubForSentry(breadcrumb.data);
  if (typeof data.url === "string") data.url = stripQuery(data.url);
  return { ...breadcrumb, data };
}

/**
 * An event before it leaves: no user, and of the request only its route and method —
 * the SDK's own collection is already off (`sentryInitOptions`), this is the second lock
 * on the same door. What this module put in `extra` is scrubbed again on the way out.
 */
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
  if (event.extra !== undefined) scrubbed.extra = scrubForSentry(event.extra);
  return scrubbed;
}

/**
 * The SDK's options for a config: PHI-safe by construction. No user info, no request or
 * response bodies, no cookies, no headers, no query strings, no stack-frame variables, no
 * database values, no AI inputs or outputs; every event and breadcrumb passes the scrub
 * above on its way out.
 *
 * Errors only by default: with no traces share, `tracesSampleRate` is left unset (a `0`
 * still counts as tracing to the SDK and registers every performance integration) and the
 * SDK's OpenTelemetry setup is skipped, so it registers no global tracer provider and no
 * context manager — an OpenTelemetry SDK the product runs beside it keeps the globals.
 * With a share above zero Sentry owns them; see the docs before turning that on.
 */
export function sentryInitOptions(config: SentryConfig): NodeOptions {
  return {
    dsn: config.dsn ?? undefined,
    environment: config.environment,
    release: config.release ?? undefined,
    ...(config.tracesSampleRate > 0 ? { tracesSampleRate: config.tracesSampleRate } : {}),
    skipOpenTelemetrySetup: config.tracesSampleRate === 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    },
    includeLocalVariables: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  };
}

/**
 * Starts the SDK for `config` once. False when there is no DSN — nothing is initialised
 * and no SDK behaviour exists; true when Sentry is up, whether this call started it or
 * the preload (`preload.ts`) did before the bundle loaded. The two agree through the SDK
 * itself: node_modules are external to both builds, so `isInitialized` reads one client.
 */
export function startSentry(config: SentryConfig): boolean {
  if (config.dsn === null) return false;
  if (!Sentry.isInitialized()) Sentry.init(sentryInitOptions(config));
  return true;
}

/** Sends what is still queued and stops the client; a no-op without a DSN, never rejects. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!Sentry.isInitialized()) return;
  try {
    await Sentry.close(timeoutMs);
  } catch {
    // The last batch may be lost on the way out; the process still stops.
  }
}
