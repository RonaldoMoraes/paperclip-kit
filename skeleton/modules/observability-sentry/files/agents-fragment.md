- **Errors go through the telemetry port.** Server code injects `TELEMETRY`
  (`apps/server/src/common/ports/telemetry.ts`) and calls `captureError(error, context)`;
  the filter already does it for every unexpected exception. Nothing imports `@sentry/*`
  outside `apps/server/src/observability/`, `apps/web/src/lib/sentry.ts` +
  `apps/web/src/app/SentryBoundary.tsx` and `apps/mobile/src/lib/sentry.ts` — a feature
  never calls the SDK, never reads a DSN.
- **Nothing PHI leaves the process.** A context field is an identifier or a shape — a
  request id, a route, a code, a count — never a body, a message, a person's text or
  health data. The Sentry sink drops any key matching
  `preview|body|content|payload|cookie|header|authorization|secret|token|password|query`
  at any depth and every console breadcrumb; the SDK collects no user, cookie, header,
  query string, body or stack-frame variable. That is the second lock — the rule is
  upstream, in what is put in the field.
- **Sentry receives errors only.** `captureError` and a `log` at the `error` level; every
  other level, every `event`, stays on the console. No tracing unless
  `SENTRY_TRACES_SAMPLE_RATE` is set, no session replay, no `setUser` — ever. A DSN left
  unset is the off switch; `.env` holds it, never the code.
