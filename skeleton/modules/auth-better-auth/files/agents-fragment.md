- **Auth on both transports.** Web sends the browser's cookie jar (`credentials: "include"`
  in `apps/web/src/lib/http.ts`); mobile sends the `Cookie` header the auth client keeps in
  secure storage (`bootSession` in `apps/mobile/src/lib/session.ts` registers it on the
  transport). An endpoint that reads the session is `@UseGuards(SessionGuard)` and takes it
  as `@Session()` — it never parses a cookie or a header itself — and is tried from both
  transports before it is called done. `OptionalSessionGuard` + `@MaybeSession()` is the
  open-door variant for a route an anonymous caller may use.
- **The session is one query on web (`sessionKey` in `apps/web/src/lib/session.ts`) and
  `authClient.useSession()` on mobile.** A route reads it from the gate's context
  (`session` in `GateContext`), a hook invalidates it after anything that changes it;
  nothing reads or writes the cookie (`client-storage.grit`), nothing calls
  `/api/auth/get-session` through `http` — the auth client owns that call on both platforms.
- **A user id is `userIdOf(session)`** (`apps/server/src/auth/user-id.ts`): Better Auth
  hands ids out as strings, the database keys rows with integers, and that function is the
  one place the two meet. A Prisma read by user never coerces the id inline.
- **Mock mode's session is the mock cookie** (`shared/contracts/mock-session.ts`): a mocked
  run boots signed in as `MOCK_USER`, a mocked sign-in sets the cookie for the address he
  typed, sign-out writes the signed-out marker, and every authenticated mock resolves the
  user with `readMockSession(cookies)` — nothing else decides who is signed in. The code
  that works is `12345` in mock mode and against a development server alike.
- **Another module extends auth through its two seams, never by editing its files.** On the
  server that is the `auth-extensions` port (`apps/server/src/auth/auth.extensions.ts`):
  claim it in the claiming module's `module.json` (`server.ports`) and return `plugins`
  and/or a `sessionExtension` — never a second `customSession`, never a hand-added plugin
  in `createAuth`. In mock mode it is the session-extras cookie
  (`sessionExtraCookie` in `shared/contracts/mock-session.ts`) — never a second msw handler
  for `/api/auth/get-session`. Both merge extras first and `user`/`session` last, so an
  extension adds fields and never rewrites who is signed in.
- **A module's copy is imported from its own file** (`@domain/account/copy`): the
  `@domain/copy` barrel is base-owned and a module never edits it. Same keys on web and
  mobile, `fill()` for the slots, no string literal in a screen.
