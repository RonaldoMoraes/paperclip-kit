/**
 * Optional: start Sentry before anything else loads.
 *
 *   yarn build:server && yarn build:sentry-preload
 *   node -r ./apps/server/dist/observability/preload.js apps/server/dist/main.js
 *
 * `TelemetryProvider` starts the same SDK inside its factory when this did not run, and
 * for errors that is early enough. With `SENTRY_TRACES_SAMPLE_RATE` above zero the SDK
 * instruments `http` and Express by patching them when they are first required, so it has
 * to be up before `main.js` requires anything — that is the one reason to run this.
 * Built apart from the bundle, so `.env` is read here as `main.ts` would.
 */
import "dotenv/config";
import { loadObservabilityConfig } from "./observability.config";
import { startSentry } from "./sentry";

startSentry(loadObservabilityConfig(process.env).sentry);
