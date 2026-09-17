import { Injectable, type NestMiddleware } from "@nestjs/common";
import { SpanKind, SpanStatusCode, type Tracer, context, propagation, trace } from "@opentelemetry/api";
import { currentRequestId } from "./request-context";

/** The instrumentation scope every request span is created under. */
export const TRACER_NAME = "apps/server/telemetry";

type IncomingRequest = {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
  /** set by Express once a route matched — the low-cardinality name a span wants */
  route?: { path?: string };
};
type OutgoingResponse = { statusCode: number; once(event: "finish" | "close", listener: () => void): unknown };

/**
 * One server span per request, parented to the caller's `traceparent` when it sent one.
 * Named by the method alone until a route matched, then `GET /api/example/items/:id` —
 * never the raw path, which would make every id its own span name. Ends when the answer
 * is out, or when the socket closed before it was. With no SDK started (`startOtel`
 * exported nothing) the span is a non-recording no-op and this costs almost nothing.
 */
export function traceRequest(tracer: Tracer, req: IncomingRequest, res: OutgoingResponse, next: () => void): void {
  const parent = propagation.extract(context.active(), req.headers);
  const attributes: Record<string, string> = {
    "http.request.method": req.method,
    "url.path": req.originalUrl.split("?")[0],
  };
  const requestId = currentRequestId();
  if (requestId !== undefined) attributes["request.id"] = requestId;

  tracer.startActiveSpan(req.method, { kind: SpanKind.SERVER, attributes }, parent, (span) => {
    let ended = false;
    const end = (): void => {
      if (ended) return;
      ended = true;
      const route = req.route?.path;
      if (typeof route === "string") span.updateName(`${req.method} ${route}`);
      span.setAttribute("http.response.status_code", res.statusCode);
      if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
    };
    res.once("finish", end);
    res.once("close", end);
    next();
  });
}

@Injectable()
export class RequestSpanMiddleware implements NestMiddleware {
  use(req: IncomingRequest, res: OutgoingResponse, next: () => void): void {
    traceRequest(trace.getTracer(TRACER_NAME), req, res, next);
  }
}
