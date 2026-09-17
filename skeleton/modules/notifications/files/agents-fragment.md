- **Nothing sends a message except through the notification port.** A feature injects
  `NOTIFICATION_CLIENT` and calls `sendEmail` / `sendSms` / `sendPush`; it never opens a
  vendor client, never `fetch`es a mail or SMS API, never reads a notification key from
  `process.env`. Vendor SDKs (`@sendgrid/*`, `twilio`, `@twilio/*`, `expo-server-sdk`)
  are imported only under `apps/server/src/notification/providers/` —
  `biome/notification-provider-imports.grit` errors on any other import.
- **Fake by default.** `NOTIFICATION_MODE=fake` prints every send to the console and
  sends nothing; `real` is asked for by name and refuses to boot without its keys.
  Switching a running environment to `real` is a message to a real inbox — a paid,
  irreversible action that needs per-instance approval, never a default.
- **Message copy is a template.** What an email says lives under
  `apps/server/src/notification/templates/`, rendered with `renderTemplate(name, params)`
  into `{ subject, text, html }`; every value that reaches HTML goes through
  `escapeHtml`. A feature never concatenates a value into markup itself.
- **Telemetry carries no recipient and no content** — a request id, the channel, the
  provider, the mode, the outcome and the duration. A log line that names an address or
  quotes a message body is a bug.
