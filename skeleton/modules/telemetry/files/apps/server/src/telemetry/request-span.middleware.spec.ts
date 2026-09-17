import { EventEmitter } from "node:events";
import { SpanKind, SpanStatusCode, propagation } from "@opentelemetry/api";
import { core, node, tracing } from "@opentelemetry/sdk-node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runWithRequestContext } from "./request-context";
import { traceRequest } from "./request-span.middleware";

const exporter = new tracing.InMemorySpanExporter();
const tracer = new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(exporter)] }).getTracer(
  "spec"
);

beforeAll(() => {
  propagation.setGlobalPropagator(new core.W3CTraceContextPropagator());
});
afterAll(() => {
  propagation.disable();
});
afterEach(() => {
  exporter.reset();
});

type Request = Parameters<typeof traceRequest>[1];
const request = (overrides: Partial<Request> = {}): Request => ({
  method: "GET",
  originalUrl: "/api/example/items/abc?x=1",
  headers: {},
  ...overrides,
});
const answer = () => Object.assign(new EventEmitter(), { statusCode: 200 });

describe("traceRequest", () => {
  it("opens a server span and closes it, named by the route, when the answer is out", () => {
    const req = request();
    const res = answer();
    const next = vi.fn();

    traceRequest(tracer, req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(exporter.getFinishedSpans()).toEqual([]);

    req.route = { path: "/api/example/items/:id" };
    res.emit("finish");
    res.emit("close");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("GET /api/example/items/:id");
    expect(spans[0].kind).toBe(SpanKind.SERVER);
    expect(spans[0].status.code).toBe(SpanStatusCode.UNSET);
    expect(spans[0].attributes).toEqual({
      "http.request.method": "GET",
      "url.path": "/api/example/items/abc",
      "http.response.status_code": 200,
    });
  });

  it("carries the request id, keeps the bare method when no route matched, and marks a 5xx", () => {
    const res = answer();
    runWithRequestContext({ requestId: "req-1", startedAt: 0 }, () => traceRequest(tracer, request(), res, () => {}));

    res.statusCode = 503;
    res.emit("close");

    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe("GET");
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes).toMatchObject({ "request.id": "req-1", "http.response.status_code": 503 });
  });

  it("continues the caller's trace from its traceparent", () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const res = answer();
    traceRequest(tracer, request({ headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` } }), res, () => {});
    res.emit("finish");

    const [span] = exporter.getFinishedSpans();
    expect(span.spanContext().traceId).toBe(traceId);
    expect(span.parentSpanContext?.spanId).toBe("00f067aa0ba902b7");
  });
});
