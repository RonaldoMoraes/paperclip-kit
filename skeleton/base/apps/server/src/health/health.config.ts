import * as pkg from "../../../../package.json";

export type HealthConfig = {
  /** what `/api/health` reports — the deploy's own stamp when it sets one, else the package version */
  version: string;
};

/**
 * The only reader of `process.env` for the health endpoint.
 *
 * The package version is bundled in at build time, so the running server needs no
 * `package.json` beside it. A deploy that stamps builds with a commit or a tag sets
 * `APP_VERSION` and that wins — the point of the endpoint is to say which build answered.
 */
export function loadHealthConfig(env: Record<string, string | undefined>): HealthConfig {
  return { version: env.APP_VERSION?.trim() || pkg.version };
}
