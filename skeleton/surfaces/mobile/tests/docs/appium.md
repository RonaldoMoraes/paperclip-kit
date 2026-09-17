# Appium (mobile)

The mobile e2e lane: WebdriverIO 9 driving a built binary through an Appium 2 server.
Same page objects and specs on iOS and Android — a React Native `testID` is the
accessibility id on both, so a selector is `~<testID>`.

## Prerequisites

1. Appium 2 on the PATH: `npm i -g appium`, then `appium driver install uiautomator2`
   (Android) and/or `appium driver install xcuitest` (iOS). Appium is **not** a dependency
   of this workspace; the machine or the runner provides it.
2. A booted emulator or simulator (`.agents/skills/mobile` has the loops).
3. `APP_PATH` — the binary: `yarn --cwd apps/mobile fetch-build <android|ios> <profile>`
   downloads the newest finished EAS build into `apps/mobile/.expo/builds/` and prints the
   path; a local `expo run:*` output works too.
4. `MOBILE_PLATFORM=android|ios` (default android).

## Run

```bash
appium                       # terminal 1, leave it running
yarn test:mobile:smoke       # terminal 2, from the product root (or `yarn --cwd tests test:mobile:smoke`)
yarn test:mobile:regression
```

With `APP_PATH` unset every spec skips itself, so the suite is safe in a web-only CI run.

The lane compiles on its own: `yarn typecheck:tests:appium` (part of `yarn typecheck`) runs
`tsc` over `appium/`, `pages/mobile/` and `specs/mobile/` with the wdio globals
(`tests/tsconfig.appium.json`); the web suite's `tsconfig.json` leaves those directories out.

## Capabilities

`appium/capabilities/{android,ios}.ts` — UiAutomator2 and XCUITest, `noReset`, device
names overridable with `ANDROID_DEVICE_NAME` / `IOS_DEVICE_NAME`; `APPIUM_HOST` /
`APPIUM_PORT` reach a server elsewhere.

## Writing a spec

- A spec drives a page object (`pages/mobile/*.page.ts`) and never a raw selector: the
  `validate:specs` gate refuses `browser.$(` / `driver.$(` in a spec.
- A page object resolves the static spine through the catalog's `mobile` front —
  `mobileSelector("example_list_title")` from `helpers/elements.ts`, the same
  `elements/*.yaml` the web suite reads — and builds per-row ids from the screen's prefix
  (`~example-list-row-<id>`). A key with no phone counterpart says `mobile: none`.
- Handles are the screens' own `<screen>-<element>` ids. A state a spec asserts travels
  as `aria-valuetext` (the detail's `example-detail-status` reads `done` / `open`),
  never as copy.
- The app answers from its contract mocks: build or start it with
  `EXPO_PUBLIC_API_MODE=mock`, and the seed under `shared/contracts/**/mock-library.ts`
  is what the screens show — a spec imports it for ids and counts rather than writing them.
- Lanes are folders, like the web's: `specs/mobile/smoke` (short, real use) and
  `specs/mobile/regression` (broad). The unit sibling per screen is `yarn test:contract`'s;
  there is no per-screen contract lane on the phone, because the suite is device-driven.
