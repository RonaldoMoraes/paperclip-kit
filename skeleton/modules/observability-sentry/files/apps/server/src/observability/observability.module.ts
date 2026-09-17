import { type BeforeApplicationShutdown, Module } from "@nestjs/common";
import { flushSentry } from "./sentry";

/**
 * The domain's home in `KIT_MODULES`. The port itself is bound by the global `PortsModule`
 * from `telemetry.provider.ts`, so a feature injects `TELEMETRY` without importing this
 * module. What is left here is the way out: with Nest's shutdown hooks enabled
 * (`app.enableShutdownHooks()` in `main.ts`) the queued events are sent before the process
 * stops; without them the SDK's own uncaught-exception handler still flushes on a crash.
 */
@Module({})
export class ObservabilityModule implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(): Promise<void> {
    await flushSentry();
  }
}
