import type { BetterAuthPlugin } from "better-auth";
import { describe, expect, it } from "vitest";
import type { NotificationClient } from "../common/ports/notification";
import type { Telemetry } from "../common/ports/telemetry";
import type { Db } from "../database/scope-extension";
import { loadAuthConfig } from "./auth.config";
import { AUTH_EXTENSIONS, type AuthExtensions, NoAuthExtensionsProvider, noAuthExtensions } from "./auth.extensions";
import { type AuthDeps, createAuth } from "./better-auth";

const notifications = {
  sendEmail: async () => {},
  sendSms: async () => {},
  sendPush: async () => {},
} satisfies NotificationClient;

const telemetry = { captureError: () => {}, log: () => {}, event: () => {} } satisfies Telemetry;

const config = loadAuthConfig({ BETTER_AUTH_URL: "https://app.example.com", BETTER_AUTH_SECRET: "a".repeat(32) });

/** Nothing here reaches the database: `createAuth` builds the instance, it does not connect. */
const deps = (extensions: AuthExtensions): AuthDeps => ({
  prisma: {} as Db,
  notifications,
  telemetry,
  config,
  extensions,
});

const pluginIds = (extensions: AuthExtensions): string[] =>
  (createAuth(deps(extensions)).options.plugins ?? []).map((plugin) => plugin.id);

const claimed: BetterAuthPlugin = { id: "claimant" };

describe("NoAuthExtensionsProvider", () => {
  it("answers the port's token with nothing to add", () => {
    expect(NoAuthExtensionsProvider).toEqual({ provide: AUTH_EXTENSIONS, useFactory: noAuthExtensions });
    expect(noAuthExtensions()).toEqual({ plugins: [], sessionExtension: undefined });
  });

  // The point of the default: with nothing claiming the port, `createAuth` builds the list
  // it built before the port existed.
  it("leaves the plugin list exactly as it was", () => {
    expect(pluginIds({ plugins: [], sessionExtension: undefined })).toEqual(["expo", "email-otp", "custom-session"]);
    expect(pluginIds({})).toEqual(["expo", "email-otp", "custom-session"]);
  });
});

describe("a claimed auth-extensions port", () => {
  // Position is the contract: after this module's own doors, and before `customSession`,
  // which has to see every other plugin's contribution to the session.
  it("puts the claimant's plugins after this module's and before customSession", () => {
    expect(pluginIds({ plugins: [claimed] })).toEqual(["expo", "email-otp", "claimant", "custom-session"]);
  });
});
