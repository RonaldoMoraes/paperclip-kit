import { Module } from "@nestjs/common";

/**
 * The domain's home in `KIT_MODULES`. The port itself is bound by the global `PortsModule`
 * from `notification.provider.ts`, so a feature injects `NOTIFICATION_CLIENT` without
 * importing this module, and nothing else needs wiring today: a controller (a delivery
 * receipt webhook, say) or a scheduled job is registered here when it arrives.
 */
@Module({})
export class NotificationModule {}
