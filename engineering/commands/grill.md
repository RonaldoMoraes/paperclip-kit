---
description: The interview — learn only what changes the generated product, then write .paperclip/project.manifest.json
argument-hint: "[area to (re)visit, e.g. payments]"
---

Run the grill for **$ARGUMENTS** (empty = the whole interview; an area name = revisit that area and rewrite the manifest).

This is an interview, not a form. The goal is one file, `.paperclip/project.manifest.json`, that the scaffold can turn into a product tree. Everything the scaffold does not read still gets recorded under `answers`, because Claude reads it after the scaffold to finish what a script cannot.

## Before asking anything

1. Read `.paperclip/kit.json` → `kitPath`. Read `$kitPath/docs/manifest.schema.json` (the shape you must produce) and `$kitPath/docs/manifest.example.json` (a finished one).
2. List the modules the kit ships: every `$kitPath/skeleton/modules/*/module.json` — note `id`, `title`, `summary`, `requires`, `surfaces`, `placeholders`. The interview maps answers onto **these** modules; never invent one. The table below is the map as of kit 0.2.0; the `module.json` files are the truth when they differ.
3. If `.paperclip/project.manifest.json` already exists, load it: revisit only what the founder asks for, and show the diff at the end.
4. Look at the directory: an existing repo (code, `package.json`, `.git`) changes the repo-shape questions; an empty one does not.

## The modules (kit 0.2.0)

| id | requires | one line | asks (`placeholders`) |
|---|---|---|---|
| `db-prisma` | — | Postgres through Prisma 7: the `db` workspace (multi-file schema, migrations, seed, generated client), one pool per process behind the `PRISMA` token, the single import seam, `openPrisma()` for scripts | — |
| `auth-better-auth` | `db-prisma` | email-code sign-in with optional Google and Apple; one session on both transports (cookie jar on web, `Cookie` header from secure storage on the phone); `SessionGuard`; sign-in screen on web and mobile; sign out and delete account on Settings; a mocked session that is a real cookie | `__AUTH_FROM_EMAIL__` — "Which address sends the sign-in codes?" (default `no-reply@__DOMAIN__`) |
| `llm` | — | one `LlmClient`/`AgentRunner` port over a registry of services with failover chains; retries, structured-output repair, streaming and telemetry once; openai/anthropic/google/xai adapters plus a deterministic fake | — |
| `notifications` | — | the `notification` port for real: email through SendGrid, SMS through Twilio, push through Expo, behind `NOTIFICATION_MODE=fake\|real` with console adapters | — |
| `analytics` | — | the `analytics` port for real: one PHI-safe event contract every layer shares, a batching queue on web and mobile, `POST /api/analytics/events`, MongoDB behind `ANALYTICS_MODE=fake\|real` with a console store by default, a coverage report | — |
| `observability-sentry` | — | the `telemetry` port for real: one JSON line per call on the console always, Sentry beside it once a DSN is set — errors only, PHI-safe — on server, web and phone | — |
| `telemetry` | — | a request id on every request, structured JSON logs through one logger, one OpenTelemetry span per request (console in dev, OTLP by env) | — |
| `copy-diff` | — | `yarn copy:diff` holds `@domain/copy` byte-equal to a reference copy module, behind a reasoned allowlist | — |
| `payments-stripe` | `auth-better-auth` | subscriptions sold on the web through Stripe Checkout: the entitlement is computed once on the server and rides on the session, a guard and a route layout read it, the checkout return is settled from Stripe's own Checkout Session, every webhook is recorded and deduplicated, and with no `STRIPE_SECRET_KEY` billing is inert rather than broken | — |
| `payments-revenuecat` | `payments-stripe`, `mobile` | subscriptions sold on the phone by Apple and Google through RevenueCat, settled onto the same entitlement the Stripe module already computes: a store seam the paywall renders against (mock store in mock mode, the SDK lazily loaded otherwise), a header-authed webhook that always answers 200, and a confirm endpoint where the server reads RevenueCat rather than trusting the device | — |

## How to ask

- **Small batches**: 2–3 areas per message, each area 1–3 questions. Never the whole list at once.
- **Propose a default with its cost** for every question that has one — "Default: web only. Adding mobile later costs a second app shell and an EAS setup; adding it now costs nothing extra in the kit." The founder says yes or gives the value.
- **Plain words, never jargon**: "where do people sign in from" rather than "auth transports". Name a product or library only when the founder does, or when the choice is the answer (Stripe vs app-store billing).
- **Confirm each answer in one line** as you go ("✓ Surfaces: web now, mobile as a fast-follow"). Keep a running list; the manifest is built from the confirmed lines only.
- **Recommend, do not survey**: one recommendation per fork, the alternative and its cost in the same sentence.
- Skip what an earlier answer made moot (no payments → no trial policy; no mobile → no bundle id, scheme or store billing).
- Founder-facing decisions are no-brainers: one plain question, concrete options, a clear recommendation.

## The 14 areas (ask in this order; the manifest key each feeds)

1. **Product** — one sentence; who the user is and the word the product uses for them; what they do on day 1 / every day; the named design source of truth (Figma? a prototype? none) and whether it wins on style and copy. → `answers.product`, `answers.users`, `answers.dayOne`, `answers.designSource`, and `product.name`. A design source that owns copy suggests the `copy-diff` module.
2. **Surfaces** — where do people use this: a website, an app on their phone, or both? Phone-width web first with native fast-follow? Anything one-platform on purpose? A phone app always rides along with the website — `mobile` requires `web`, so "phone only" is not on the menu; say that plainly if it comes up, and record it as both. Default: `["web"]`. → `surfaces`, `answers.surfacesNote`.
3. **Repo shape** — this directory or a new one; standalone or inside a monorepo; existing shared packages (a database package? a design system?) and the one sanctioned cross-package import; package manager and lint/test tools already in use. → `answers.repo`. The kit generates one product per repo at the root — say so and note the cost of anything else.
4. **Data** — a database at all? Own or shared with another product (a shared one means a product scope, a cookie prefix and a "schema changes get their own database" rule); PHI/PII present; retention; caching rules. → `modules` (`db-prisma`), `product.dbName`, `product.cookiePrefix`, `answers.data`.
5. **Auth** — sign-in methods (email code, Apple, Google, password, 2FA); where people sign in from (browser, native app, both); rate limits. → `modules` (`auth-better-auth`, which requires `db-prisma`), `answers.auth`.
6. **Payments** — does anyone pay, and where does the money come in? Ask it that way: *"Do people pay on your website with a card, inside the phone app through Apple and Google, or both?"* Paying by card on the website is `payments-stripe`. Paying inside the phone app is `payments-revenuecat` — the stores require it for anything the app unlocks, and it needs `payments-stripe` underneath it plus the phone app itself, because both settle onto the same record of who has paid. Recommend the website's card payments first: it is one integration, it works the day it ships, and adding the stores later adds a module rather than a rewrite — going stores-first means no revenue until a build clears review. Then: trial policy; who decides access (our database, never the seller); offer variants. → `modules` (`payments-stripe`, `payments-revenuecat`), `answers.payments`.
7. **LLM use** — none / one provider / several with failover; streaming; structured output; tool calling; what may leave the building (contracts, tracing). → `modules` (`llm`), `answers.llm`.
8. **Notifications** — email / push / SMS; providers if known; anti-abuse on send endpoints. → `modules` (`notifications`), `answers.notifications`.
9. **Analytics** — an event store; the first funnel to measure; the "enums, slugs and numbers only" contract for events. → `modules` (`analytics`), `answers.analytics`.
10. **Hosting / CI** — where it deploys; path-filtered CI; where secrets live; build steps that cost money (per-instance approval); error tracking and tracing. → `modules` (`observability-sentry`, `telemetry`), `answers.hosting`.
11. **Compliance** — HIPAA / SOC 2 / GDPR; screenshot redaction; de-identification invariants; ad-policy constraints on copy. → `answers.compliance`.
12. **Team and tickets** — solo or lanes (how many developers, split by journey?); ticketing system and project key (branch names are `type/KEY-123-short-name`); language of code / git / tickets and of product docs. → `answers.team`, `answers.tickets`, `answers.languages`.
13. **Naming** — product slug (kebab; packages, cookie prefix, test-id prefix, env prefix), npm scope, domain, bundle id and URL scheme (mobile only), trunk branch, release branch pattern, port base. → `product.slug`, `product.scope`, `product.domain`, `product.bundleId`, `product.scheme`, `product.trunk`, `answers.naming`. Defaults: cookie prefix = slug, scheme = slug, db name = slug with `_`, trunk = `development`, bundle id = `com.<scope>.<slug without dashes>`.
14. **Working style** — confirm the defaults (small undoable steps; mock-first; proof proportional to the change; no git writes unless asked; design source wins on style/copy; concise reports; decisions as no-brainers) and which roles to pre-seed (the company roles plus the three engineering roles; hire the rest on demand). → `answers.workingStyle`.

Then, for **every selected module with `placeholders`**, ask each entry's `question` in one line, offering its `default`, and write the answer under `placeholders` keyed by the token (`"__AUTH_FROM_EMAIL__": "no-reply@acme.com"`). A default may name a base placeholder (`no-reply@__DOMAIN__`); the engine resolves it, so an accepted default is stored literally. A selected module whose placeholder has neither a value nor a default fails the scaffold — do not leave one unasked.

## Finish

1. Resolve `requires`: add every module a selected module requires (say which and why). A module that requires a surface the founder declined is dropped, with one line explaining.
2. Write `.paperclip/project.manifest.json` per the schema (`kit.version` = the version in `.paperclip/kit.json`). Keys in schema order; `answers` in area order.
3. Echo the file, then the one-line list of confirmed answers, and the modules with their reasons.
4. Offer `/scaffold` — "Say `/scaffold` and I generate the tree and run every gate."
