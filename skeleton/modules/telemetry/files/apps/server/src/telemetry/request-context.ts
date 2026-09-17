import { AsyncLocalStorage } from "node:async_hooks";
import type { Telemetry } from "../common/ports/telemetry";

/** What every log line and error report of one request can attach without being handed it. */
export type RequestContext = {
  requestId: string;
  /** `Date.now()` when the request entered the pipeline */
  startedAt: number;
};

/**
 * The request's context, carried by Node's async continuation rather than by a parameter.
 *
 * `RequestIdMiddleware` runs the rest of the chain inside `runWithRequestContext`, so a
 * service three calls deep — or the logger it injects — reads the id with
 * `currentRequestId()` and nothing in between had to pass it along. Outside a request
 * (boot, a scheduled job, a spec) there is no context and the readers say so with
 * `undefined`; nothing here mints an id, because a second id per call is exactly what
 * this store exists to prevent.
 */
const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * A telemetry port implementation that carries the request id on every call. A module
 * that claims the `telemetry` port wraps its sink in this once, in its factory, and the
 * filter's `captureError` arrives with the id already on the context.
 */
export function withRequestId(telemetry: Telemetry): Telemetry {
  const stamped = (fields?: Record<string, unknown>): Record<string, unknown> | undefined => {
    const requestId = currentRequestId();
    if (requestId === undefined) return fields;
    return { requestId, ...fields };
  };
  return {
    captureError: (error, context) => telemetry.captureError(error, stamped(context)),
    log: (level, message, fields) => telemetry.log(level, message, stamped(fields)),
    event: (name, fields) => telemetry.event(name, stamped(fields)),
  };
}
