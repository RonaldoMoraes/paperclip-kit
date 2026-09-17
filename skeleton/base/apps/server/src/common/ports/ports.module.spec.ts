/**
 * `PortsModule`'s exports — the half of a port that nothing short of a boot would otherwise check.
 *
 * A port that is provided and not exported is instantiated and invisible to every other module.
 * Nest says so only at boot, and only in a tree where something injects it (`can't resolve
 * Symbol(AUTH_EXTENSIONS) at index [3]`), so a hand-kept exports list looks correct in base and
 * breaks the first module that DECLARES a port for another to claim. These specs move that failure
 * here: one pins the module's real metadata to the generated list, the rest boot a declared port —
 * both provider shapes — and inject it from a module that imports nothing.
 */
import { Global, Inject, Injectable, Module, type Provider } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { KIT_PORTS } from "../../app.modules.gen";
import { ANALYTICS_CLIENT } from "./analytics";
import { NOTIFICATION_CLIENT } from "./notification";
import { PortsModule, portTokens } from "./ports.module";
import { TELEMETRY } from "./telemetry";

/** What `@Module({ exports })` actually put on the class — not what the source appears to say. */
const exportsOf = (module: object): unknown[] => (Reflect.getMetadata("exports", module) ?? []) as unknown[];

/** Nest logs a resolution failure before it throws; the failure is the assertion, not the noise. */
const silent = { log() {}, error() {}, warn() {}, debug() {}, verbose() {}, fatal() {} };

describe("PortsModule", () => {
  it("exports one token per generated port, whatever the manifest put in KIT_PORTS", () => {
    expect(exportsOf(PortsModule)).toEqual(portTokens(KIT_PORTS));
  });

  it("exports the three base ports", () => {
    expect(exportsOf(PortsModule)).toEqual(expect.arrayContaining([NOTIFICATION_CLIENT, ANALYTICS_CLIENT, TELEMETRY]));
  });
});

describe("a port a module declares", () => {
  const SEARCH = Symbol("SEARCH");
  type SearchPort = { find: () => string[] };

  /** The provider shape the engine emits today. */
  const SearchProvider: Provider = { provide: SEARCH, useValue: { find: () => ["hit"] } satisfies SearchPort };

  /** The other shape `Provider` allows: a bare class, which is its own token. */
  @Injectable()
  class ClockPort {
    readonly now = "2026-01-01T00:00:00.000Z";
  }

  const DECLARED: Provider[] = [SearchProvider, ClockPort];

  /** `PortsModule` as the manifest builds it, with a module-declared port in the list. */
  @Global()
  @Module({ providers: DECLARED, exports: portTokens(DECLARED) })
  class DerivedPortsModule {}

  /** The exports list as it used to be written: base's three, and nothing a module declared. */
  @Global()
  @Module({ providers: DECLARED, exports: [] })
  class HandKeptPortsModule {}

  /** A feature module's provider — it imports nothing, the way every consumer of a global port does. */
  @Injectable()
  class Consumer {
    constructor(
      @Inject(SEARCH) readonly search: SearchPort,
      @Inject(ClockPort) readonly clock: ClockPort
    ) {}
  }

  @Module({ providers: [Consumer] })
  class ConsumerModule {}

  it("is injectable from a module that imports nothing", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [DerivedPortsModule, ConsumerModule] }).compile();

    const consumer = moduleRef.get(Consumer, { strict: false });
    expect(consumer.search.find()).toEqual(["hit"]);
    expect(consumer.clock).toBeInstanceOf(ClockPort);
    expect(consumer.clock.now).toBe("2026-01-01T00:00:00.000Z");

    await moduleRef.close();
  });

  it("is not, when the exports list is kept by hand — the boot failure this spec exists for", async () => {
    const compiling = Test.createTestingModule({ imports: [HandKeptPortsModule, ConsumerModule] })
      .setLogger(silent)
      .compile();

    await expect(compiling).rejects.toThrow(/Symbol\(SEARCH\)/);
  });
});
