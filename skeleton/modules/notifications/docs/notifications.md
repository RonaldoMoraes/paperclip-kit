# Notifications

The `notification` port for real. Base binds a console client to `NOTIFICATION_CLIENT`;
this module replaces it through `KIT_PORTS` with a service that sends email through
SendGrid, SMS through Twilio and push through Expo's push service — or, by default,
prints every send to the console and sends nothing. Everything lives under
[`apps/server/src/notification/`](../apps/server/src/notification).

## Modes

`NOTIFICATION_MODE` ([`notification.config.ts`](../apps/server/src/notification/notification.config.ts))
is `fake` unless set to `real`, in every environment: an accidental real send is worse
than a missed one.

| mode | email | sms | push | needs |
| --- | --- | --- | --- | --- |
| `fake` (default) | console | console | console | nothing |
| `real` | SendGrid | Twilio | Expo | `SENDGRID_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN`, `SMS_FROM`; `EXPO_ACCESS_TOKEN` optional |

`real` refuses to boot when a key is missing, naming every one in a single error. The
console adapters print the whole message — a sign-in code has to be readable in the
terminal when no mail goes out. The boot log states the mode and the adapter behind each
channel (`[notification] ready`), so a log always says whether the process can send.

## How a feature sends

Inject the token; never a class, never a vendor:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { NOTIFICATION_CLIENT, type NotificationClient } from "../common/ports/notification";
import { renderTemplate } from "../notification/templates";

@Injectable()
export class SignInService {
  constructor(@Inject(NOTIFICATION_CLIENT) private readonly notifications: NotificationClient) {}

  async sendCode(to: string, code: string): Promise<void> {
    await this.notifications.sendEmail({ to, ...renderTemplate("sign-in-code", { code, expiresInMinutes: 10 }) });
  }
}
```

The request shapes are the port's zod schemas (`EmailRequest`, `SmsRequest` with an E.164
`to`, `PushRequest` with one token or many). A send resolves to nothing or rejects with
`NotificationError`, whose `code` is what a caller branches on:

| code | meaning | who fixes it |
| --- | --- | --- |
| `invalid_request` | the schema refused the request (or the Expo adapter a non-Expo token); no adapter ran | the caller |
| `configuration` | an adapter has no way to send with what it was given | the deploy |
| `provider_error` | the vendor refused or was unreachable; `cause` is the vendor's error | retry, or the vendor |

## Templates

[`templates/`](../apps/server/src/notification/templates) is the copy a message carries.
`renderTemplate(name, params)` is typed by name — `renderTemplate("sign-in-code", { code })`
returns `{ subject, text, html }`, and a misspelled name or a missing parameter fails to
compile. A template escapes every value it puts in HTML through `escapeHtml`; the text
body is the same message without markup. Adding one is a file beside
[`sign-in-code.ts`](../apps/server/src/notification/templates/sign-in-code.ts) and one line
in the registry in `templates/index.ts`.

## What telemetry hears

[`notification.service.ts`](../apps/server/src/notification/notification.service.ts) is
the one place a send is validated, timed, reported and its error wrapped. Every send emits
one `notification.send` event through the base `TELEMETRY` port — request id, channel,
provider, mode, `success | failure | refused`, duration, error code — and a failure adds
an `error` log line, a refusal a `warn` one. Never the recipient, never the content: a
sink can be shipped anywhere without leaking a message.

## Adapters

[`providers/`](../apps/server/src/notification/providers) holds one adapter per vendor
per channel, each a dumb transport: map the request, call the SDK, throw on refusal. The
vendor SDKs are imported only there — `biome/notification-provider-imports.grit` errors
on an import anywhere else, and `yarn lint:guards` proves the guard fires. Each vendor
adapter takes its client as an optional constructor argument, so its spec hands it a stub
and no spec mocks a module.

- **SendGrid** (`email/sendgrid.adapter.ts`) — its own `MailService`, the configured
  sender unless the request names one, `text` passed only when given.
- **Twilio** (`sms/twilio.adapter.ts`) — `messages.create` from the configured number
  unless the request names one.
- **Expo** (`push/expo.adapter.ts`) — one message fanned out to every token, chunked and
  sent one chunk at a time as Expo asks; a non-Expo token is `invalid_request` before any
  call, an error ticket is a `provider_error` — a device that was not reached is a failed
  send, not a success with a footnote.

**Swapping a vendor** is a new adapter under `providers/<channel>/` that implements the
channel's interface in `provider.types.ts`, one branch in `adaptersFor` in
[`notification.provider.ts`](../apps/server/src/notification/notification.provider.ts),
and — if the SDK is new — its scope added to the guard's regex and the canary fixture.
Nothing outside `notification/` changes.

## Wiring

`module.json` claims `server.ports.notification` with `NotificationProvider`, a Nest
provider for the base token built through `useFactory` from the config and the
`TELEMETRY` port, so the global `PortsModule` exports it to every module. `NotificationModule`
sits in `KIT_MODULES` as the domain's home and carries no providers today; a delivery
receipt webhook or a scheduled digest is registered there when it arrives.
