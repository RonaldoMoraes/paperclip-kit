# Server work

Domain services, Zod schemas/contracts, wiring a feature into `apps/server`, background
work and cache, and server tests. `docs/server.md` has the module anatomy; this is the
procedure.

## Ownership split

`shared/contracts` owns the endpoint's shape (request, response, errors) and its mock.
`shared/domain` owns rules and derivations that every app must compute the same way.
`apps/server/src/<feature>/` owns the work: the module (wiring only), the controller
(route + delegation), the service (the work, no framework), the store or repository
(persistence), `config.ts` (the only env reader), `types.ts` (Symbol tokens).

Services must be callable from a controller, a job, a script or a REPL without importing
host code — pass primitives and DTOs, not request objects.

## Services

Services are leaves: a service does not import another feature's service. If a flow
needs several, the controller composes them so the route reads as its own flow.

```ts
// Bad
getSummary(req: Request)

// Good
getSummary({ userId, date }: { userId: number; date: string })
```

Persistence goes through the feature's store (`example.store.memory.ts` in base; a
database-backed one when the db module is present), behind a structural interface and a
Symbol token so the service is unit-testable with an in-memory store.

Errors: throw the named class from `shared/contracts/<feature>/errors.ts` when a caller
can act on it (`error-shape.grit` warns on a bare `new Error`). The one error filter
turns it into the `{ code, issues }` envelope; do not catch-and-swallow unless the product
wants log-and-continue.

## Schemas and contracts

The contract module is the schema. The controller validates with it (`@ZodBody` and the
pipe), the mock answers with a fixture parsed by it, the client calls through it.

- Derive types from schemas: `type Item = z.infer<typeof ItemSchema>`; never a parallel
  interface.
- The response schema is the normalisation boundary: stores and services return their
  natural typed data; the controller returns what the contract's response schema parses.
  No `as` bridges between persistence and contract types (`no-unknown-cast.grit`).
- Decide unknown-key behaviour on purpose: strip for stored payloads read back, strict
  for user input.

## Wiring a feature

```text
shared/contracts/<feature>/*.ts   →  apps/server/src/<feature>/<feature>.service.ts
                                  →  <feature>.controller.ts (@ZodBody, delegates)
                                  →  <feature>.module.ts (providers + the store token)
                                  →  app.module.ts imports it (a kit module lands in app.modules.gen.ts instead)
```

Copy `apps/server/src/example/` — it is the golden path. A new env var is read in that
feature's `config.ts` only, and named in `.env.example` with the file that reads it.

Ports (`notification`, `analytics`, `telemetry`) are injected by token from
`common/ports/`; a feature calls the interface and never a vendor SDK — a module
provides the real implementation behind the same token.

## Background work and cache

Add neither pre-emptively. A job or a cache earns its place when work is too slow for
request/response, retries are required, state needs durable reconciliation, several
surfaces need one expensive derived result, or polling status is part of the product.
The feature owns the job's payload schema, handler logic and status DTO; the host owns
scheduling, queue wiring and deploy config. Cache keys carry feature scope, user id when
user-specific, date/range when date-specific, and a version when invalidation must be
explicit.

## Server tests

Specs sit beside the unit (`<feature>.service.spec.ts`, `<feature>.controller.spec.ts`)
— the testing contract demands them. A service spec uses the in-memory store; a
controller spec mocks the service with explicit factories. No `vi.hoisted`, no
`importOriginal` (`no-flaky-mocks.grit`): declare `const mockX = vi.fn()` at file scope
and keep `vi.mock()` at the bottom. Test a claim, not a literal: if the logic behind it
were broken, would this test fail?
