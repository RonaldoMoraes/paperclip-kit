/// <reference types="@wdio/globals/types" />
/// <reference types="@wdio/mocha-framework" />
import { androidCapabilities } from "./capabilities/android";
import { iosCapabilities } from "./capabilities/ios";

/**
 * The mobile lane's runner: WebdriverIO over an Appium 2 server the machine provides
 * (`tests/docs/appium.md`). `MOBILE_PLATFORM` picks the device family; `APP_PATH` the
 * binary (`yarn --cwd apps/mobile fetch-build <platform> <profile>` downloads the newest
 * EAS build). Every spec skips itself when `APP_PATH` is unset, so the suite is safe to
 * run on a machine with no device.
 */
const platform = (process.env.MOBILE_PLATFORM ?? "android").toLowerCase();

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["../specs/mobile/**/*.spec.ts"],
  suites: {
    smoke: ["../specs/mobile/smoke/**/*.spec.ts"],
    regression: ["../specs/mobile/regression/**/*.spec.ts"],
  },
  maxInstances: 1,
  capabilities: [platform === "ios" ? iosCapabilities : androidCapabilities],
  logLevel: "info",
  bail: 0,
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 2,
  hostname: process.env.APPIUM_HOST ?? "127.0.0.1",
  port: Number(process.env.APPIUM_PORT ?? "4723"),
  path: "/",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 120_000,
  },
  services: [],
};
