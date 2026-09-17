# Auth (Better Auth)

Email-code sign-in, with Google and Apple when their pairs are set, on Better Auth 1.4.
One session on both transports: the browser sends its cookie jar, the phone sends the
`Cookie` header its auth client keeps in secure storage, and one guard on the server
resolves whichever arrived. Present tense — what the module does once it is on.

## Files

| File | Holds |
| --- | --- |
| [`db/prisma/schema/auth.prisma`](../db/prisma/schema/auth.prisma) | `user`, `auth_session`, `account`, `verification` — snake_case columns, `Int` ids the database hands out, the relations joins read through |
| [`apps/server/src/auth/better-auth.ts`](../apps/server/src/auth/better-auth.ts) | `createAuth(deps)`: the instance, built from the database seam, the notification port and the config. Field maps, session lifetime, the plugins, the `customSession` slot |
| [`auth.config.ts`](../apps/server/src/auth/auth.config.ts) | `loadAuthConfig(env)` — the only reader of the auth env; throws at boot for a missing URL or a short secret |
| [`otp-protection.ts`](../apps/server/src/auth/otp-protection.ts) | The code's lifetime and attempts, the per-IP rate limit on the two OTP endpoints, which header names the client |
| [`auth.extensions.ts`](../apps/server/src/auth/auth.extensions.ts) | The `auth-extensions` port: `AUTH_EXTENSIONS`, the `AuthExtensions` interface, `NoAuthExtensionsProvider` — how another module adds plugins and session fields |
| [`auth.module.ts`](../apps/server/src/auth/auth.module.ts) | `AUTH` behind a `useFactory` over `PRISMA`, `NOTIFICATION_CLIENT`, `TELEMETRY`, `AUTH_EXTENSIONS`; exports `AUTH`, `SessionGuard`, `OptionalSessionGuard` |
| [`auth.controller.ts`](../apps/server/src/auth/auth.controller.ts) | `@All("api/auth/*path")` → Better Auth's own router |
| [`session.guard.ts`](../apps/server/src/auth/session.guard.ts), [`optional-session.guard.ts`](../apps/server/src/auth/optional-session.guard.ts), [`session.decorator.ts`](../apps/server/src/auth/session.decorator.ts) | The guard, its open-door sibling, `@Session()` / `@MaybeSession()` |
| [`user-id.ts`](../apps/server/src/auth/user-id.ts) | `userIdOf(session)` — the string id Better Auth hands out, as the integer the database keys rows with |
| [`apps/server/src/account/`](../apps/server/src/account) | `GET /api/account/me`, `DELETE /api/account` — the reference for a guarded feature |
| [`shared/contracts/auth/`](../shared/contracts/auth) | `cookies` (the prefix), `session` (the narrow payload), `errors` (the closed reasons and the copy), `credentials` (the email and code rules both forms share), `send-cooldown` (the wait between codes), one module + mock per Better Auth route the apps use |
| [`shared/contracts/account/`](../shared/contracts/account) | `me`, `delete-account`, `errors` and their mocks |
| [`shared/contracts/mock-session.ts`](../shared/contracts/mock-session.ts) | The mock session cookie, `MOCK_USER`, `readMockSession`; the session-extras cookie another module adds fields through |
| [`shared/domain/account/copy.ts`](../shared/domain/account/copy.ts) | Every word the sign-in screen and the Settings rows print |
| [`apps/web/src/lib/auth.ts`](../apps/web/src/lib/auth.ts), [`lib/session.ts`](../apps/web/src/lib/session.ts) | The auth client; the session as one query, `readSession`, `refreshSession`, the `requireSession` gate |
| [`apps/web/src/app/routes/account.tsx`](../apps/web/src/app/routes/account.tsx), [`features/account/`](../apps/web/src/features/account) | The sign-in route (beside `_app`, no shell), the screen, `useSignIn`, `useSendCooldown`, the Settings rows |
| [`apps/mobile/src/lib/auth.ts`](../apps/mobile/src/lib/auth.ts), [`lib/session.ts`](../apps/mobile/src/lib/session.ts) | The Expo auth client over SecureStore; `bootSession` (the `Cookie` header on the transport), the `useSessionGate` gate, `signOut` |
| [`apps/mobile/app/sign-in.tsx`](../apps/mobile/app/sign-in.tsx), [`features/account/`](../apps/mobile/src/features/account) | The route beside `index`, the screen, the hooks, the Settings rows |
| [`tests/specs/web/contract/account/account.spec.ts`](../tests/specs/web/contract/account/account.spec.ts), [`tests/helpers/session.ts`](../tests/helpers/session.ts) | The screen's contract journey; `seedSession` / `seedSignedOut` for a spec's starting state |

## The session on each transport

**Web.** Same origin; `credentials: "include"` on `lib/http.ts` sends the jar. The
session is one query (`sessionKey`, a minute of freshness inside Better Auth's
five-minute cookie cache). The `requireSession` gate runs in `_app.tsx`'s `beforeLoad`:
no session is a `redirect` to `/account?redirect=<href>`; a session goes into the router
context, so a route under the shell reads `Route.useRouteContext().session` instead of
asking again. A verified code calls `refreshSession` before it navigates, so the gate on
the destination reads the session the person now has.

**Mobile.** A React Native fetch has no jar. `bootSession` (`KIT_BOOT`) registers
`authClient.getCookie()` on the transport through `addRequestHeaders`, read per request.
`useSessionGate` (`KIT_GATES`) reads `authClient.useSession()` and answers
`{ ready: !pending, allow: signedIn, redirectTo: "/sign-in" }`; `app/_layout.tsx` guards
the app group on it and `index` follows the redirect. Nothing navigates on a sign-out —
the session flips, `Stack.Protected` closes the group, and the gate lands on sign-in.

**Server.** `SessionGuard` calls `auth.api.getSession` with the request headers —
whichever transport carried the session — and stashes the answer for `@Session()`.
Nothing else reads a cookie. The cookie cache (`session.cookieCache`, five minutes)
answers a probe from the signed `session_data` cookie without a database read, so a
session revoked elsewhere — a sign-out on another device, a deleted account — stays
valid on a client that kept its cookies for at most those five minutes; the client that
made the call has them cleared by the answer.

## Guarding a feature

```ts
@Controller("api/notes")
@UseGuards(SessionGuard)
export class NotesController {
  @Get()
  list(@Session() session: SessionContext) {
    return this.store.listFor(userIdOf(session));
  }
}
```

The feature module imports `AuthModule` for the guard. A route an anonymous caller may
use takes `OptionalSessionGuard` and `@MaybeSession()`. A store that keys rows by owner
takes `userIdOf(session)` — Better Auth hands ids out as strings, the database keys rows
with integers, and that function is the one place the two meet. The `example` feature
stays public in base; when this module is on, adding `@UseGuards(SessionGuard)` to its
controller is the whole change.

## The doors

- **Email code.** `sendVerificationOtp({ email, type: "sign-in" })` sends a five-digit
  code through the notification port (`AUTH_FROM_EMAIL` is the sender; the console port
  in base prints the subject, the `notifications` module mails it). `signIn.emailOtp`
  exchanges it for a session. Five sends and five wrong codes per code lifetime, per IP;
  a 30-second wait between codes on both screens (`send-cooldown.ts`). In development
  the code is always `12345` (`DEV_OTP`) and printed to the server log.
- **Google, Apple.** Registered only when both halves of a pair are set. On web the
  page leaves for the provider and lands, signed in, on the destination; a failure lands
  on `/account?error=…`. On the phone the Expo client opens the system browser and returns
  on `<scheme>://`; a dismissed browser resolves without an error, so the hook reads the
  session to decide. The provider's console must know the callback:
  `BETTER_AUTH_URL/api/auth/callback/<provider>`.
- **Sign out, delete account.** Two rows on Settings (`settingsActions`). Delete goes
  through `DELETE /api/account` → `auth.api.deleteUser`; the session, account and
  verification rows cascade. Better Auth takes a deletion without a password only on a
  fresh session (`session.freshAge`, a day); a stale one is answered `403 FORBIDDEN`
  and the client's `accountFailure` names it `stale-session`.

## Mock mode

A mocked run boots signed in as `MOCK_USER` — no cookie is that person — so `yarn
dev:mock`, `yarn mobile:mock` and every e2e spec open on the signed-in app. A mocked
sign-in sets the session cookie for the address typed (any address, code `12345`);
sign-out and delete leave the signed-out marker; every authenticated mock resolves the
user through `readMockSession(cookies)`. The magic values: `00000` expired, `11111` too
many attempts, anything else invalid; `throttled@example.com` reproduces the rate
limiter's 429. A spec that must start signed out calls `seedSignedOut(page)`.

## The `customSession` slot

`customSession` is the last plugin: it replaces `/get-session`, and what it returns is
what both apps read off the probe they already make. It answers the extras from the
`auth-extensions` port first and `user` / `session` last, so an extension adds fields and
can never rewrite who is signed in. A product's own code edits this file; another module
goes through the port below.

## Extending auth from another module

Two seams, one on each side, and a module that uses them never edits a file of this one.

**Server — the `auth-extensions` port.** This module declares the port and binds the empty
default; a module that has something to add claims it and its provider replaces the
default in `KIT_PORTS`. One provider answers `AUTH_EXTENSIONS`, always:

```ts
// apps/server/src/auth/auth.extensions.ts
export type AuthSessionContext = { user: User; session: Session; db: Db };

export interface AuthExtensions {
  /** Better Auth plugins to build the instance with, in the slot `better-auth.ts` marks. */
  plugins?: BetterAuthPlugin[];
  /** Extra fields for the session payload; whatever it resolves is merged into the answer. */
  sessionExtension?: (ctx: AuthSessionContext) => Promise<Record<string, unknown>>;
}
```

The claim, in the claiming module's `module.json` — which also `requires` this one, so the
declaration is always in the tree:

```json
"requires": ["auth-better-auth"],
"server": {
  "ports": {
    "auth-extensions": { "import": "./billing/auth-extensions.provider", "symbol": "BillingAuthExtensionsProvider" }
  }
}
```

and the provider it points at:

```ts
// apps/server/src/billing/auth-extensions.provider.ts
export const BillingAuthExtensionsProvider: Provider = {
  provide: AUTH_EXTENSIONS,
  useFactory: (): AuthExtensions => ({
    plugins: [stripe({ stripeClient, stripeWebhookSecret, subscription: { enabled: true } })],
    // `db` is the scoped client auth itself runs on — no second connection, no injection here
    sessionExtension: async ({ user, db }) => ({ access: await readAccess(db, userIdOf(user)) }),
  }),
};
```

A provider that does need something injected takes it from `inject:` as usual; only the
globally exported tokens (`PRISMA` and the ports) are in scope, exactly as for a provider
that claims one of base's three.

`plugins` land after `expo()` and `emailOTP()` and before `customSession`: a claimant
extends auth rather than sitting in front of its doors, and anything that contributes to
the session has to run before the plugin that freezes what the session is.
`sessionExtension` runs on every session probe — keep it to one indexed read, or cache it,
because Better Auth's cookie cache is the only thing between it and every request.

**Mock mode — the session-extras cookie.** Mock mode has one handler for
`/api/auth/get-session`, and a second handler for the same path would race it. The extras
ride in a cookie instead (`shared/contracts/mock-session.ts`), which is how every other
piece of mock state travels:

```ts
import { sessionExtraCookie } from "@contracts/mock-session";

// in the claiming module's own mock — its checkout, its webhook, its QA panel
return json({ ok: true }, { setCookies: [sessionExtraCookie({ access: { plan: "pro" } })] });
```

`readSessionExtra(cookies)` reads them back and `get-session` merges them into its answer.
`clearedSessionExtraCookie()` puts a run back to none.

**The merge rule, the same on both sides:** extras first, `user` and `session` last. An
extension adds fields to the session and never rewrites who is signed in, and the mock
reads extras only for a session that already exists — a cookie of extras cannot make a
signed-out run look signed in. Whatever an extension adds, widen
`shared/contracts/auth/session.ts` in the same change and every gate on both platforms
reads it without a second request.

One constraint on what the mock cookie carries: it must be JSON. Strings holding a space
or an `=` are escaped to `\uXXXX` on the way in, so any JSON value survives the round
trip; anything that is not readable JSON reads as no extras rather than as a throw.

## Env

| Variable | Read by | Default |
| --- | --- | --- |
| `BETTER_AUTH_URL` | `auth.config.ts` | — (required); the origin the browser uses |
| `BETTER_AUTH_SECRET` | `auth.config.ts` | — (required, ≥ 32 chars) |
| `AUTH_FROM_EMAIL` | `auth.config.ts` | the scaffold's `__AUTH_FROM_EMAIL__` |
| `MOBILE_SCHEME` | `auth.config.ts` | one scheme per installed variant |
| `AUTH_TRUSTED_ORIGINS` | `auth.config.ts` | empty |
| `COOKIE_DOMAIN` | `auth.config.ts` | host-only cookies |
| `CLIENT_IP_HEADER` | `otp-protection.ts` | `x-forwarded-for` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` | `auth.config.ts` | provider off |

`NODE_ENV=development` (base) is what turns the fixed code and the `exp://` origin on.

## Swapping pieces

- Another mail provider: none to swap here — the code leaves through the notification
  port, and the `notifications` module (or any provider of `NOTIFICATION_CLIENT`) decides
  how it is sent. The message itself is `signInCodeMail` in `better-auth.ts`.
- A password door, a magic link: a Better Auth plugin in `createAuth`'s list and its
  client plugin in each `lib/auth.ts`; the screens are the product's to extend.
- A captcha on the OTP endpoints: `captcha()` from `better-auth/plugins` over
  `OTP_ENDPOINTS`, added where the comment in `better-auth.ts` marks the slot; exempt the
  Expo app by its `expo-origin` header.
