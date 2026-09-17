import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";

/**
 * The domain's home in `KIT_MODULES`: the one door batches enter through. The port itself
 * is bound by the global `PortsModule` from `analytics.provider.ts`, so the controller —
 * and any feature — injects `ANALYTICS_CLIENT` without importing this module.
 */
@Module({
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
