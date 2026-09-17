import { describe, expect, it } from "vitest";
import { GetHealthResponse } from "@contracts/health/get-health";
import { loadHealthConfig } from "./health.config";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("answers ok with the version it was configured with, in the contract's shape", () => {
    const answer = new HealthController({ version: "1.2.3" }).read();
    expect(answer).toEqual({ ok: true, version: "1.2.3" });
    expect(GetHealthResponse.parse(answer)).toEqual(answer);
  });
});

describe("loadHealthConfig", () => {
  it("reads the package version when the deploy stamped nothing", () => {
    expect(loadHealthConfig({}).version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("lets a deploy's own stamp win, trimmed, and ignores a blank one", () => {
    expect(loadHealthConfig({ APP_VERSION: " 2026.09.09-abc123 " }).version).toBe("2026.09.09-abc123");
    expect(loadHealthConfig({ APP_VERSION: "   " }).version).toBe(loadHealthConfig({}).version);
  });
});
