---
name: mobile
description: Procedures for `apps/mobile` (Expo) — drive the Android emulator (`scripts/android-loop.sh`) or an iOS simulator (XcodeBuildMCP, on the developer's Mac) for runtime proof; inspect EAS, run an approved build, publish an OTA update, submit to TestFlight / Play, or write a workflow; change the layering (a guard or its scope). Load when a mobile change needs device evidence, a release step, or a structure a guard rejects.
---

# Mobile

A router. Classify the task, read only the matching reference.

| Task | Reference |
|---|---|
| Runtime proof on Android: preflight, bring-up, tap/wait by `testID`, screenshot, record | [references/android-emulator.md](references/android-emulator.md) |
| Runtime proof on iOS: XcodeBuildMCP gate, launch, snapshot, tap, screenshot | [references/ios-simulator.md](references/ios-simulator.md) |
| EAS: inspect builds/channels/envs, `eas build`, `eas workflow:run`, `eas update`, submit, rollback, edit a workflow | [references/eas-release.md](references/eas-release.md) |
| A design needs something a guard rejects — a new import edge, a new scope, a new rule | [references/layering-change.md](references/layering-change.md) |

`scripts/android-loop.sh` is the executable form of the Android reference; it reads the
bundle id, scheme and API origin from the app's `.env` (`MOBILE_BUNDLE_ID`,
`EXPO_PUBLIC_SCHEME`, `EXPO_PUBLIC_API_URL`), so it cannot point at the wrong app. The
app lives at `apps/mobile` unless `MOBILE_DIR` says otherwise. `preflight` first, always.
iOS runs only where XcodeBuildMCP is installed — the reference's gate decides, and a
missing install is reported, never worked around.

Every handle the loops address is a screen's own `<screen>-<element>` `testID`
(`example-list-item-first`, `settings-action-sign-out`); a control without one gets one
before it is driven, never a coordinate.

The evidence a mobile change presents — mock-first on a device, a JS reload for a JS
change and a native rebuild only for a native one, a sibling spec per screen — is
`AGENTS.md`. The EAS money rule there applies before `eas-release.md` is read: a build
is approved by the developer, in this conversation, before any command that spends.

## Related

- `docs/mobile.md` — route map, slots, routes-read/screens-render, delivery.
- `tests/docs/appium.md` — the Appium lane over a built binary.
- `biome.json` + `biome/*.grit` (`route-no-logic`, `screen-chrome`, `mock-seam`,
  `mobile-ui-imports`, `spring-mass`, `expo-public-env`) — write-time enforcement; their
  messages are the authority on what is allowed.
- `ANDROID_LOOP_*` overrides (Android reference) carry machine-specific bring-up; a
  developer keeps them in `CLAUDE.local.md`, which nothing here depends on.
