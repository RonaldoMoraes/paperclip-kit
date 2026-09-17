import type { Provider } from "@nestjs/common";
import type { BetterAuthPlugin, Session, User } from "better-auth";
import type { Db } from "../database/scope-extension";

/**
 * The `auth-extensions` port: how another module adds to this one's Better Auth instance
 * without editing a file of it.
 *
 * This module declares the port and binds the empty default (`module.json`'s
 * `server.portDefaults`); a module that has something to add claims it in its own
 * `module.json` and the generated `KIT_PORTS` carries its provider instead. Exactly one
 * provider answers `AUTH_EXTENSIONS`, always — with nothing claiming it, the one below,
 * which adds no plugin and no session field, so `createAuth` builds what it built before
 * the port existed.
 *
 * Two things ride here because they are the two places a product's own concern has to
 * reach into auth: the plugin list Better Auth is built from, and the session payload
 * `customSession` answers `/api/auth/get-session` with. An entitlement (a plan, a role,
 * a set of limits) is computed once, on the server, and both apps read it off the probe
 * they already make.
 */

/**
 * What `customSession` can hand an extension: the person, their session, and the scoped
 * client this module was built with. Deliberately these three — the payload is computed
 * on every session probe, so an extension gets what it needs to read a row and nothing
 * that would invite a request-scoped dependency into a cached path.
 */
export type AuthSessionContext = {
  user: User;
  session: Session;
  /** the same `Db` `createAuth` runs on — the base client with the product's scope applied */
  db: Db;
};

export interface AuthExtensions {
  /** Better Auth plugins to build the instance with, in the slot `better-auth.ts` marks. */
  plugins?: BetterAuthPlugin[];
  /** Extra fields for the session payload; whatever it resolves is merged into the answer. */
  sessionExtension?: (ctx: AuthSessionContext) => Promise<Record<string, unknown>>;
}

/** Consumers depend on this token, never on a provider: `@Inject(AUTH_EXTENSIONS)`. */
export const AUTH_EXTENSIONS = Symbol("AUTH_EXTENSIONS");

/** The default the port ships with: no plugin, no session field, no behaviour of its own. */
export const noAuthExtensions = (): AuthExtensions => ({ plugins: [], sessionExtension: undefined });

export const NoAuthExtensionsProvider: Provider = {
  provide: AUTH_EXTENSIONS,
  useFactory: noAuthExtensions,
};
