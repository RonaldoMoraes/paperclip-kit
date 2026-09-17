import { Controller, Get, Inject } from "@nestjs/common";
import type { GetHealthResponse } from "@contracts/health/get-health";
import type { HealthConfig } from "./health.config";
import { HEALTH_CONFIG } from "./health.types";

/** `GET /api/health` — the probe a load balancer, a smoke test and the settings screen read. */
@Controller("api/health")
export class HealthController {
  constructor(@Inject(HEALTH_CONFIG) private readonly config: HealthConfig) {}

  @Get()
  read(): GetHealthResponse {
    return { ok: true, version: this.config.version };
  }
}
