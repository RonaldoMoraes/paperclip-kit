/**
 * The middlewares and the logger, on real routes.
 *
 * Their unit specs prove each piece; this proves they are wired for every route in the
 * order that matters — an id that reached the header but not the access line, or a
 * middleware `configure()` forgot, passes every other spec in this directory.
 *
 * The ports are built here, not imported from `PortsModule`. That module provides whatever
 * the manifest generated into `KIT_PORTS`, and a port a module provides may inject a token
 * that only the real `AppModule` makes global — `payments-stripe`'s auth-extensions port
 * takes `PRISMA` from the `db-prisma` module's `@Global() DatabaseModule`. Compiling the
 * generated list in an isolated testing module therefore fails to resolve on any tree that
 * selected such a module, and proves nothing about the middlewares either way. This module
 * binds the one port this pipeline touches — the telemetry sink — from base's own null
 * object, the way `request-pipeline.integration.spec.ts` builds the ports it needs.
 */
import { Global, type INestApplication, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TELEMETRY, noopTelemetry } from "../common/ports/telemetry";
import { ExampleModule } from "../example/example.module";
import { HealthModule } from "../health/health.module";
import { LOGGER, type Logger } from "./logger";
import { REQUEST_ID_HEADER } from "./request-id.middleware";
import type { TelemetryConfig } from "./telemetry.config";
import { TelemetryModule } from "./telemetry.module";
import { TELEMETRY_CONFIG } from "./telemetry.types";

/**
 * Global, exactly as `PortsModule` is: a port is bound outside every feature module, so
 * whatever injects it reaches it without an import.
 */
@Global()
@Module({
  providers: [{ provide: TELEMETRY, useValue: noopTelemetry }],
  exports: [TELEMETRY],
})
class TelemetryPortsModule {}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Line = { level: string; msg: string; fields?: Record<string, unknown> };

const capture = () => {
  const lines: Line[] = [];
  const at =
    (level: string) =>
    (msg: string, fields?: Record<string, unknown>): void => {
      lines.push({ level, msg, fields });
    };
  const logger: Logger = {
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
    child: () => logger,
  };
  return { logger, lines };
};

const config = (logHealth: boolean): TelemetryConfig => ({
  logLevel: "info",
  logHealth,
  otel: { serviceName: "spec", endpoint: null, console: false },
});

type Server = { app: INestApplication; url: string; lines: Line[] };

async function boot(logHealth: boolean): Promise<Server> {
  const { logger, lines } = capture();
  const moduleRef = await Test.createTestingModule({
    imports: [TelemetryModule, TelemetryPortsModule, HealthModule, ExampleModule],
  })
    .overrideProvider(TELEMETRY_CONFIG)
    .useValue(config(logHealth))
    .overrideProvider(LOGGER)
    .useValue(logger)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0);
  return { app, url: await app.getUrl(), lines };
}

const accessLines = (lines: Line[]) => lines.filter((line) => line.msg === "request");
const accessLineFor = async (lines: Line[], path: string) =>
  vi.waitFor(() => {
    const line = accessLines(lines).find((candidate) => candidate.fields?.path === path);
    expect(line).toBeDefined();
    return line as Line;
  });

let logged: Server;
let quiet: Server;
const env = {
  OTEL_CONSOLE: process.env.OTEL_CONSOLE,
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
};

beforeAll(async () => {
  // `onModuleInit` reads the process env for the SDK; a developer's shell must not turn spans on here.
  process.env.OTEL_CONSOLE = "false";
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "";
  logged = await boot(true);
  quiet = await boot(false);
});

afterAll(async () => {
  await logged.app.close();
  await quiet.app.close();
  process.env.OTEL_CONSOLE = env.OTEL_CONSOLE;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = env.OTEL_EXPORTER_OTLP_ENDPOINT;
});

describe("telemetry, end to end", () => {
  it("says at boot what it exports", () => {
    expect(logged.lines[0]).toMatchObject({ level: "info", msg: "telemetry ready", fields: { exporters: [] } });
  });

  it("echoes the caller's request id on the answer and on the access line", async () => {
    const response = await fetch(`${logged.url}/api/health`, { headers: { [REQUEST_ID_HEADER]: "gw-echo-1" } });

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("gw-echo-1");
    const line = await accessLineFor(logged.lines, "/api/health");
    expect(line.fields).toEqual({
      method: "GET",
      path: "/api/health",
      status: 200,
      ms: expect.any(Number),
      requestId: "gw-echo-1",
    });
  });

  it("mints an id when none came, and a failing route gets one too", async () => {
    const response = await fetch(`${logged.url}/api/example/items/nobody`);

    expect(response.status).toBe(404);
    const minted = response.headers.get(REQUEST_ID_HEADER);
    expect(minted).toMatch(UUID_V4);
    const line = await accessLineFor(logged.lines, "/api/example/items/nobody");
    expect(line.fields).toMatchObject({ status: 404, requestId: minted });
  });

  it("keeps the health probe out of the log when asked, and nothing else", async () => {
    await fetch(`${quiet.url}/api/health`);
    const listed = await fetch(`${quiet.url}/api/example/items`);

    expect(listed.status).toBe(200);
    await accessLineFor(quiet.lines, "/api/example/items");
    expect(accessLines(quiet.lines).map((line) => line.fields?.path)).toEqual(["/api/example/items"]);
  });
});
