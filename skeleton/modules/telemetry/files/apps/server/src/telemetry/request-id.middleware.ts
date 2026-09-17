import { randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { runWithRequestContext } from "./request-context";

export const REQUEST_ID_HEADER = "x-request-id";

/** What an upstream id may look like: one token, no whitespace, nothing a log line would misread. */
const WELL_FORMED = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type IncomingRequest = { headers: Record<string, string | string[] | undefined> };
type OutgoingResponse = { setHeader(name: string, value: string): unknown };

/**
 * The id an upstream sent, when it sent exactly one and it is well formed; otherwise
 * nothing. A gateway that already stamped the request keeps its id across the hop; a
 * caller that sends garbage gets a fresh one rather than a log line it chose.
 */
export function readRequestId(header: string | string[] | undefined): string | undefined {
  if (typeof header !== "string") return undefined;
  const trimmed = header.trim();
  return WELL_FORMED.test(trimmed) ? trimmed : undefined;
}

/**
 * First in the chain: every request leaves with an `x-request-id`, echoed when the
 * caller sent one and minted otherwise, and everything after this — the other
 * middlewares, the handler, the filter, the logger — runs inside the request context
 * that carries it.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: IncomingRequest, res: OutgoingResponse, next: () => void): void {
    const requestId = readRequestId(req.headers[REQUEST_ID_HEADER]) ?? randomUUID();
    res.setHeader(REQUEST_ID_HEADER, requestId);
    runWithRequestContext({ requestId, startedAt: Date.now() }, next);
  }
}
