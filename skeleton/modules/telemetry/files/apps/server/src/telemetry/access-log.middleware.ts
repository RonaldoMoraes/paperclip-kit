import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import { LOGGER, type Logger } from "./logger";
import { currentRequestId } from "./request-context";
import type { TelemetryConfig } from "./telemetry.config";
import { TELEMETRY_CONFIG } from "./telemetry.types";

/** The probe a load balancer hits every few seconds; `LOG_HEALTH=false` keeps it out of the log. */
export const HEALTH_PATH = "/api/health";

type IncomingRequest = { method: string; originalUrl: string };
type OutgoingResponse = { statusCode: number; once(event: "finish" | "close", listener: () => void): unknown };

/**
 * One line per request, written when the answer is out: method, path (never the query
 * string — a token rides there more often than anyone likes), status, elapsed
 * milliseconds and the request id. A request whose socket closed before the answer
 * logs too, marked `aborted`, so a client that gave up is not a request that vanished.
 */
@Injectable()
export class AccessLogMiddleware implements NestMiddleware {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(TELEMETRY_CONFIG) private readonly config: TelemetryConfig
  ) {}

  use(req: IncomingRequest, res: OutgoingResponse, next: () => void): void {
    const path = req.originalUrl.split("?")[0];
    if (!this.config.logHealth && req.method === "GET" && path === HEALTH_PATH) {
      next();
      return;
    }

    // Captured now, inside the request context, rather than read when the response
    // finishes: a socket event is not guaranteed to run in the continuation that made it.
    const requestId = currentRequestId();
    const startedAt = performance.now();
    let written = false;
    const write = (aborted: boolean): void => {
      if (written) return;
      written = true;
      this.logger.info("request", {
        method: req.method,
        path,
        status: res.statusCode,
        ms: Math.round((performance.now() - startedAt) * 10) / 10,
        requestId,
        ...(aborted ? { aborted: true } : {}),
      });
    };
    res.once("finish", () => write(false));
    res.once("close", () => write(true));
    next();
  }
}
