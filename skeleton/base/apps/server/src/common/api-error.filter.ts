import { type ArgumentsHost, Catch, type ExceptionFilter, Inject } from "@nestjs/common";
import { isUnexpected, toApiError } from "./api-error";
import { TELEMETRY, type Telemetry } from "./ports/telemetry";

type Answer = {
  status(code: number): Answer;
  json(body: unknown): unknown;
  headersSent?: boolean;
};

/**
 * The one place an exception becomes a response body.
 *
 * The app's only global filter — Nest stops at the first `@Catch()` that matches, so a
 * second one never runs. Reporting is therefore this filter's job, and it reports exactly
 * the failures nobody described — `isUnexpected` is that line — through the telemetry
 * port, whose console default logs and whose module implementation (Sentry, say) ships
 * it. The caller gets a generic message either way.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  constructor(@Inject(TELEMETRY) private readonly telemetry: Telemetry) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ path?: string; method?: string }>();
    const response = http.getResponse<Answer>();

    const { status, body } = toApiError(exception);
    if (isUnexpected(exception)) {
      this.telemetry.captureError(exception, {
        mechanism: "api_error_filter",
        method: request?.method ?? "unknown",
        path: request?.path ?? "unknown path",
      });
    }

    if (response.headersSent) return;
    response.status(status).json(body);
  }
}
