- **Logs are JSON lines through the logger.** Server code injects `LOGGER`
  (`apps/server/src/telemetry/logger.ts`) and writes `logger.info("what happened", { fields })`:
  one line, one level, credentials redacted by key. `console.*` stays inside `telemetry/`
  and `common/ports/`; `no-console-in-domain.grit` warns on the rest. A body, a token or a
  person's free text never goes in a field.
- **A request id rides every log line and error report.** `RequestIdMiddleware` echoes or
  mints `x-request-id`; the logger attaches it from the request context; a `telemetry` port
  implementation wraps itself in `withRequestId()` so `captureError` carries it too. Read
  `currentRequestId()` — never mint a second id per call.
