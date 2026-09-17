import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiException, codeForStatus, toApiError } from "./api-error";
import { ApiErrorFilter } from "./api-error.filter";
import type { Telemetry } from "./ports/telemetry";
import { ZodValidationPipe } from "./zod.pipe";

const rejection = (): unknown => {
  try {
    new ZodValidationPipe(z.object({ done: z.boolean() })).transform({}, { type: "body" } as const);
  } catch (error) {
    return error;
  }
};

const hostFor = (path: string) => {
  const response = { status: vi.fn(() => response), json: vi.fn(), headersSent: false };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ path, method: "GET" }), getResponse: () => response }),
  } as never;
  return { host, response };
};

/** The port, as the filter sees it: only `captureError` matters here. */
const telemetry = () => {
  const captured: unknown[] = [];
  const port: Telemetry = {
    captureError: (error) => {
      captured.push(error);
    },
    log: () => {},
    event: () => {},
  };
  return { port, captured };
};

describe("toApiError", () => {
  it("turns a refused body into a 400 carrying zod's issues", () => {
    expect(toApiError(rejection())).toMatchObject({
      status: 400,
      body: { code: "VALIDATION", issues: [expect.objectContaining({ path: ["done"] })] },
    });
  });

  it("names a Nest exception by its status and keeps its message", () => {
    expect(toApiError(new ConflictException("Already there."))).toEqual({
      status: 409,
      body: { code: "CONFLICT", message: "Already there." },
    });
    expect(toApiError(new ForbiddenException())).toMatchObject({ status: 403, body: { code: "FORBIDDEN" } });
    expect(toApiError(new ServiceUnavailableException("Billing is not configured."))).toEqual({
      status: 503,
      body: { code: "INTERNAL", message: "Billing is not configured." },
    });
  });

  it("passes an envelope this app named through untouched", () => {
    expect(toApiError(new ApiException(404, "NOT_FOUND", "There is no item with that id."))).toEqual({
      status: 404,
      body: { code: "NOT_FOUND", message: "There is no item with that id." },
    });
  });

  it("answers anything else 500 with a message that gives nothing away", () => {
    const mapped = toApiError(new Error("connect ECONNREFUSED 10.0.0.4:5432 — password authentication failed"));

    expect(mapped.status).toBe(500);
    expect(mapped.body.code).toBe("INTERNAL");
    expect(mapped.body.message).not.toMatch(/ECONNREFUSED|password/);
  });
});

describe("codeForStatus", () => {
  it("names the five statuses the contract has a code for, and INTERNAL for the rest", () => {
    expect(codeForStatus(400)).toBe("VALIDATION");
    expect(codeForStatus(404)).toBe("NOT_FOUND");
    expect(codeForStatus(418)).toBe("INTERNAL");
    expect(codeForStatus(503)).toBe("INTERNAL");
  });
});

describe("ApiErrorFilter", () => {
  it("writes the envelope on an /api route", () => {
    const { host, response } = hostFor("/api/example/items/nope");

    new ApiErrorFilter(telemetry().port).catch(new ApiException(404, "NOT_FOUND", "Not here."), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ code: "NOT_FOUND", message: "Not here." });
  });

  it("reports an unexpected error through the telemetry port — no other filter would", () => {
    const { host } = hostFor("/api/example/items");
    const { port, captured } = telemetry();
    const cause = new Error("the connection pool is on fire");

    new ApiErrorFilter(port).catch(cause, host);

    expect(captured).toEqual([cause]);
  });

  it("reports nothing for a failure the app named, whatever its status, or any other 4xx", () => {
    const { host } = hostFor("/api/example/items");
    const { port, captured } = telemetry();
    const filter = new ApiErrorFilter(port);

    filter.catch(new ApiException(403, "FORBIDDEN", "Nope."), host);
    filter.catch(new ConflictException("Already there."), host);
    filter.catch(rejection(), host);
    // A feature switched off is this deployment's configuration, not an incident — which
    // is why a controller raises it as an ApiException rather than Nest's 503.
    filter.catch(new ApiException(503, "INTERNAL", "Billing is not configured."), host);

    expect(captured).toEqual([]);
  });

  it("reports a 5xx nobody named — the app raised it, but not as an answer it chose", () => {
    const { host } = hostFor("/api/example/items");
    const { port, captured } = telemetry();
    const filter = new ApiErrorFilter(port);

    filter.catch(new InternalServerErrorException("the writer gave up"), host);
    filter.catch(new ServiceUnavailableException("Billing is not configured."), host);

    expect(captured).toHaveLength(2);
  });

  it("never repeats an unexpected error's text to the caller", () => {
    const { host, response } = hostFor("/api/example/items");

    new ApiErrorFilter(telemetry().port).catch(new Error("the connection pool is on fire"), host);

    expect(response.json).toHaveBeenCalledWith({ code: "INTERNAL", message: expect.not.stringContaining("pool") });
  });

  it("writes nothing over an answer that has already gone out", () => {
    const { host, response } = hostFor("/api/example/items");
    response.headersSent = true;

    new ApiErrorFilter(telemetry().port).catch(new Error("late"), host);

    expect(response.json).not.toHaveBeenCalled();
  });
});
