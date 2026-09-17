import {
  type BeforeApplicationShutdown,
  Global,
  Inject,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type OnModuleInit,
} from "@nestjs/common";
import { AccessLogMiddleware } from "./access-log.middleware";
import { JsonLogger, LOGGER, type Logger } from "./logger";
import { type OtelHandle, startOtel } from "./otel";
import { RequestIdMiddleware } from "./request-id.middleware";
import { RequestSpanMiddleware } from "./request-span.middleware";
import { type TelemetryConfig, loadTelemetryConfig } from "./telemetry.config";
import { TELEMETRY_CONFIG } from "./telemetry.types";

/**
 * Cross-cutting plumbing, not a feature: a request id on every request, one span per
 * request, one access line per request, and the logger every module injects. Global so
 * a feature writes `@Inject(LOGGER)` without importing anything; env is read inside the
 * factories, so importing the logger in a spec reads none. The `telemetry` port keeps
 * whatever binds it (`KIT_PORTS`) — this module adds the id and the lines around it.
 */
@Global()
@Module({
  providers: [
    { provide: TELEMETRY_CONFIG, useFactory: (): TelemetryConfig => loadTelemetryConfig(process.env) },
    {
      provide: LOGGER,
      useFactory: (config: TelemetryConfig): Logger => new JsonLogger({ level: config.logLevel }),
      inject: [TELEMETRY_CONFIG],
    },
  ],
  exports: [TELEMETRY_CONFIG, LOGGER],
})
export class TelemetryModule implements NestModule, OnModuleInit, BeforeApplicationShutdown {
  private otel: OtelHandle | undefined;

  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  /** Every route, in this order: the id first so the span and the line can carry it. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, RequestSpanMiddleware, AccessLogMiddleware).forRoutes("*");
  }

  onModuleInit(): void {
    this.otel = startOtel(process.env);
    this.logger.info("telemetry ready", { exporters: this.otel.exporters });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.otel?.shutdown();
  }
}
