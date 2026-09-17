import { Module } from "@nestjs/common";
import { type HealthConfig, loadHealthConfig } from "./health.config";
import { HealthController } from "./health.controller";
import { HEALTH_CONFIG } from "./health.types";

/** Wiring only: env is read inside the factory, so importing the controller in a spec reads none. */
@Module({
  controllers: [HealthController],
  providers: [{ provide: HEALTH_CONFIG, useFactory: (): HealthConfig => loadHealthConfig(process.env) }],
})
export class HealthModule {}
