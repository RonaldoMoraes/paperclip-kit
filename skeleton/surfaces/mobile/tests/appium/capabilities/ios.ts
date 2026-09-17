/// <reference types="@wdio/globals/types" />

const appPath = process.env.APP_PATH ?? "";

/** iOS / XCUITest. `APP_PATH` is an `.app` for a simulator or an `.ipa` for a device. */
export const iosCapabilities: WebdriverIO.Capabilities = {
  platformName: "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": process.env.IOS_DEVICE_NAME ?? "iPhone 16",
  ...(appPath ? { "appium:app": appPath } : {}),
  "appium:noReset": true,
  "appium:newCommandTimeout": 120,
};
