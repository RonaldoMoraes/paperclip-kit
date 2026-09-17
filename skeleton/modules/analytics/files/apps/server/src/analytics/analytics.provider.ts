import type { Provider } from "@nestjs/common";
import { ANALYTICS_CLIENT, type AnalyticsClient } from "../common/ports/analytics";
import { TELEMETRY, type Telemetry } from "../common/ports/telemetry";
import { type AnalyticsConfig, loadAnalyticsConfig } from "./analytics.config";
import { AnalyticsService } from "./analytics.service";
import { ConsoleAnalyticsStore } from "./providers/console.adapter";
import { MongoAnalyticsStore } from "./providers/mongo.adapter";
import type { AnalyticsStoreAdapter } from "./providers/provider.types";

/** The store a config asks for: the console sink in fake mode, MongoDB in real. */
function storeFor(config: AnalyticsConfig): AnalyticsStoreAdapter {
  if (config.store.provider === "mongo") return new MongoAnalyticsStore(config.store);
  return new ConsoleAnalyticsStore();
}

/**
 * Builds the client a config describes and says so once through telemetry, so a boot log
 * always states whether this process stores anything. The one place a store is
 * constructed: swapping the store is a new adapter under `providers/` and one line here.
 */
export function createAnalyticsClient(config: AnalyticsConfig, telemetry: Telemetry): AnalyticsService {
  const service = new AnalyticsService({ mode: config.mode, store: storeFor(config), telemetry });
  telemetry.log("info", "[analytics] ready", { mode: service.mode, store: service.provider });
  return service;
}

/**
 * The port's provider, bound by the global `PortsModule` from `KIT_PORTS` in place of the
 * console default. Env is read inside the factory, so importing this file reads none, and
 * a missing key in real mode fails at boot — before a batch could reach a store.
 */
export const AnalyticsProvider: Provider = {
  provide: ANALYTICS_CLIENT,
  inject: [TELEMETRY],
  useFactory: (telemetry: Telemetry): AnalyticsClient =>
    createAnalyticsClient(loadAnalyticsConfig(process.env), telemetry),
};
