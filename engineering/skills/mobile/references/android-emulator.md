# Android emulator loop

Runtime proof for `apps/mobile` on any machine with the Android SDK (`adb`, `emulator`,
one AVD) — no Mac, no physical device.

`scripts/android-loop.sh` (next to this skill) is the procedure. It reads the bundle id,
scheme and API origin from the app's `.env` at call time (`MOBILE_BUNDLE_ID`,
`EXPO_PUBLIC_SCHEME`, `EXPO_PUBLIC_API_URL`), so it cannot drive the wrong app. Prefer it
over hand-rolled `adb`. `MOBILE_DIR` points it at an app that is not `apps/mobile`;
`METRO_PORT` (default 8300, the base port; a worktree slot adds 10 × slot) at a Metro that
is not on the base port.

## The loop

```bash
S=.agents/skills/mobile/scripts/android-loop.sh
export ANDROID_LOOP_ENV_FILE=<file>     # see Machine overrides — first, every call
$S preflight                            # read-only: emulator, dev client, Metro, API origin
yarn mobile:mock                        # Metro in mock mode, in its own shell; leave it running
$S up                                   # boot + adb reverse + dev-client deep link + dev-menu dismissal
$S ui [filter]                          # accessibility tree: testID, label, class, clickable, bounds
$S tap example-list-item-first          # by testID, label, or substring — ambiguity is an error
$S wait example-detail 30               # block until the route root is mounted
$S tap example-detail-toggle
$S text 'hello'; $S key BACK            # type into the focused field, then close the keyboard
$S shot /tmp/proof.png                  # then READ the image
$S rec /tmp/flow.mp4 45                 # a flow instead of a screen (drive from another shell)
$S down                                 # stop the emulator this loop booted, drop its reverse
```

Also: `xy`, `swipe`, `fg` (foreground activity), `logs [filter]`, `down --force`.

Which screen `up` lands on depends on the gates: base opens on the first tab; with the
auth module a dev client with a persisted session opens on the tabs, a fresh one on
sign-in. Dump `ui` before assuming either.

## Machine overrides

Bring-up and teardown are the only machine-specific steps, and an agent's shell does not
keep exports between calls — so put the machine's block in a file and pass it as
`ANDROID_LOOP_ENV_FILE` on every invocation. The developer's block lives in
`CLAUDE.local.md`; copy it to a scratch file verbatim. Seams: `ANDROID_LOOP_UP_CMD` /
`_DOWN_CMD` replace boot and kill outright; `ANDROID_LOOP_AVD`, `_EMULATOR_ARGS`,
`_WINDOW=1` tune the default; `ANDROID_LOOP_SERIAL` pins one emulator when several are
up (the loop refuses to guess). Headless runs need `-gpu swangle_indirect`; the
SwiftShader backends segfault without a window.

Where the emulator belongs to someone else — another account, another session, a shared
machine — set `ANDROID_LOOP_NO_BOOT=1`. `up` then attaches to a running device and says so
plainly instead of starting one, and `down` leaves it up.

One run drives the device at a time. The commands that change it (`up`, `tap`, `xy`,
`swipe`, `text`, `key`, `down`) queue on a host-wide lock shared with every other loop on
the machine, waiting `ANDROID_LOOP_LOCK_WAIT` seconds (default 300) before refusing. The
observers — `preflight`, `ui`, `wait`, `shot`, `fg`, `rec`, `logs` — never queue, so `rec`
still records while another shell drives.

## First time on an AVD

The dev client is a local native build, not an EAS artifact. With the emulator booted
(`$S up` boots, then stops at "not installed" and leaves it running):

```bash
yarn --cwd apps/mobile android        # expo run:android — gradle build + install + launch, ~7 min cold
```

Repeat after any native change (a new native module, a config plugin, an embedded font).
A change to `app.config.js` that touches the manifest needs `npx expo prebuild --platform
android --clean` first, or the stale native project is reused.

## Teardown

`down` returns before qemu has exited — wait ~15 s before the straggler check:

```bash
pgrep -fal 'qemu-system|emulator -avd|expo start'   # the adb fork-server staying up is normal
```

Stop Metro if you started it. Never kill by pattern: Metro on 8300, the server on 3000 and
an emulator may be someone else's.

## Sign-in (auth module)

The auth module's social sign-in opens the system browser and returns on the custom
scheme (`EXPO_PUBLIC_SCHEME`); Android needs no App Link for that. Email OTP needs no
browser at all: `text` the address, `tap` send, read the dev OTP from the server log (or
the mock's `MOCK_OTP` in mock mode), `text` it, `tap` verify. The session flips the gate
and the guard opens the app — nothing navigates on the tap.

## Traps

- Keyboard open → `uiautomator` merges keyboard rows into the tree and `tap <label>` can
  hit one. `key BACK` after `text`, then dump. `BACK` on the root screen backgrounds the
  app; `up` relaunches idempotently.
- Taps race navigations: `wait` on the target, never sleep. If `tap` says "no clickable
  element", re-run `ui` and retry — never fall back to coordinates.
- `localhost` inside the emulator is the emulator. Reach a local server by the host's
  name (or `10.0.2.2`, the default in `src/lib/config.ts`). Metro bakes `EXPO_PUBLIC_*`
  at start — restart it with `--clear` after a `.env` edit. Never restart the server
  mid-flow.
- Never `pm clear com.android.chrome` (first-run wizard blocks every Custom Tab); never
  `adb kill-server` while an emulator boots; one qemu per AVD.
- Backgrounding a dev server through `| tail` swallows its output. Run it directly and
  read its log file.

| Symptom | Cause |
| --- | --- |
| "Development servers" list on screen | Wrong package, or launched without the Metro deep link — use `up` |
| Old screen after an edit | Metro serving another worktree, or not restarted after `.env` |
| `[mock]` lines missing from `logs` | Metro started without `EXPO_PUBLIC_API_MODE=mock` — use `yarn mobile:mock` |
| `ui` returns (almost) nothing | App still starting, or a native dialog owns the window — retry, then `shot` |
| `tap` ambiguous | Two controls share a label — give the one you want a `<screen>-<element>` ID |
| `tap` finds nothing, `ui` shows the label | Node not `clickable`; tap the parent's ID or `wait` on the label |
