/**
 * The pipe, the filter and the ports, on real routes.
 *
 * Their unit specs prove each piece; this proves they are wired — a `@Body()` that lost
 * its schema, a filter nobody registered, or a port the filter cannot inject passes every
 * other test in this directory.
 *
 * The ports are built here, not imported from `PortsModule`. That module provides whatever
 * the manifest generated into `KIT_PORTS`, and a port a module provides may inject a token
 * that only the real `AppModule` makes global — `payments-stripe`'s auth-extensions port
 * takes `PRISMA` from the `db-prisma` module's `@Global() DatabaseModule`. Compiling the
 * generated list in an isolated testing module therefore fails to resolve on any tree that
 * selected such a module, and proves nothing about the pipeline either way. This module
 * binds the one port the pipeline itself needs — the filter's telemetry sink — from base's
 * own null object, the way `ports.module.spec.ts` builds its ports from its own fixtures.
 */

import { Global, type INestApplication, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOCK_ITEMS } from "@contracts/example/mock-library";
import { ExampleModule } from "../example/example.module";
import { HealthModule } from "../health/health.module";
import { ApiErrorFilter } from "./api-error.filter";
import { TELEMETRY, noopTelemetry } from "./ports/telemetry";

/**
 * Global, exactly as `PortsModule` is: the filter is built outside any feature module, so
 * a port it injects has to be reachable without an import.
 */
@Global()
@Module({
  providers: [{ provide: TELEMETRY, useValue: noopTelemetry }],
  exports: [TELEMETRY],
})
class PipelinePortsModule {}

let app: INestApplication;
let url: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [PipelinePortsModule, HealthModule, ExampleModule],
    providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0);
  url = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

const put = (path: string, body: unknown) =>
  fetch(`${url}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("the pipeline, end to end", () => {
  it("answers the health probe", async () => {
    const response = await fetch(`${url}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, version: expect.any(String) });
  });

  it("answers a refused body 400 in the envelope with zod's issues", async () => {
    const response = await put(`/api/example/items/${MOCK_ITEMS[0].id}/done`, {});

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; issues: Array<{ path: string[] }> };
    expect(body.code).toBe("VALIDATION");
    expect(body.issues[0].path).toEqual(["done"]);
  });

  it("answers a refused route param 400 the same way", async () => {
    const response = await fetch(`${url}/api/example/items/NOT_A_SLUG`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION" });
  });

  it("lets a valid body through and the write shows on the next read", async () => {
    const written = await put(`/api/example/items/${MOCK_ITEMS[1].id}/done`, { done: true });
    expect(written.status).toBe(200);
    const read = await fetch(`${url}/api/example/items/${MOCK_ITEMS[1].id}`);
    expect(await read.json()).toMatchObject({ id: MOCK_ITEMS[1].id, done: true });
  });

  it("answers a missing item and an unknown route in the same envelope", async () => {
    const missing = await fetch(`${url}/api/example/items/nobody`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "NOT_FOUND" });

    const unknown = await fetch(`${url}/api/nowhere`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ code: "NOT_FOUND" });
  });
});
