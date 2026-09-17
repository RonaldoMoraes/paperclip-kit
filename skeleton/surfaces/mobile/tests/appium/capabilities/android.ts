/// <reference types="@wdio/globals/types" />

const appPath = process.env.APP_PATH ?? "";

/** Android / UiAutomator2. `APP_PATH` is the apk `fetch-build` downloaded, or any local build. */
export const androidCapabilities: WebdriverIO.Capabilities = {
  platformName: "Android",
  "appium:automationName": "UiAutomator2",
  "appium:deviceName": process.env.ANDROID_DEVICE_NAME ?? "Android Emulator",
  ...(appPath ? { "appium:app": appPath } : {}),
  "appium:noReset": true,
  "appium:newCommandTimeout": 120,
};
