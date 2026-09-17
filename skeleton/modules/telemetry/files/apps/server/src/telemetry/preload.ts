/**
 * Optional: start OpenTelemetry before anything else loads.
 *
 *   yarn build:server && yarn build:otel-preload
 *   node -r ./apps/server/dist/telemetry/preload.js apps/server/dist/main.js
 *
 * `TelemetryModule.onModuleInit` starts the same SDK when this did not run, and for the
 * request spans this module makes itself that is early enough. A library instrumentation
 * (`@opentelemetry/instrumentation-http`, `-pg`, …) patches a module when it is first
 * required, so it has to be registered before `main.js` requires anything — that is the
 * one reason to run this, and where such an instrumentation is added (`createOtel`).
 * Built apart from the bundle, so `.env` is read here as `main.ts` would.
 */
import "dotenv/config";
import { startOtel } from "./otel";

startOtel(process.env);
