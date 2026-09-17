# iOS simulator loop

Runtime proof for `apps/mobile` on an Apple Simulator, driven through **XcodeBuildMCP**
([xcodebuildmcp.com](https://www.xcodebuildmcp.com/)). It needs a Mac with Xcode 16+ and
the `xcodebuildmcp` CLI; the agent does not install either.

## Gate — before anything else

```bash
xcodebuildmcp --version         # present? (verbs below are from 2.2.1)
xcodebuildmcp tools             # the authority on verbs and workflows for the installed version
```

If the CLI is missing, or this host is not a Mac: **stop.** Report the iOS tier as *not
exercised* and ask the developer to set XcodeBuildMCP up on their Mac (`brew install
getsentry/xcodebuildmcp/xcodebuildmcp` or `npm i -g xcodebuildmcp`). Do not fall back to
raw `xcrun simctl` taps or pixel coordinates, and do not simulate the run. Verbs move
between workflows across versions — when one below is "Unknown argument", find it in
`tools` rather than guessing.

## The loop

```bash
MOBILE_DIR="${MOBILE_DIR:-apps/mobile}"
PKG="$(grep -E '^MOBILE_BUNDLE_ID=' "$MOBILE_DIR/.env" | tail -1 | cut -d= -f2)"
xcodebuildmcp simulator list                                   # pick a device, keep its UDID in $S
xcodebuildmcp simulator-management boot --simulator-id $S      # also under `simulator boot`
yarn mobile:mock                                               # Metro, own shell, leave running
xcodebuildmcp simulator launch-app --simulator-id $S --bundle-id "$PKG"
xcodebuildmcp simulator snapshot-ui --simulator-id $S          # accessibility tree, JSON with frames
xcodebuildmcp ui-automation tap --simulator-id $S --id example-list-item-first   # by testID; --label for copy
xcodebuildmcp ui-automation type-text --simulator-id $S --text "hello"
xcodebuildmcp simulator screenshot --simulator-id $S           # then READ the image
xcodebuildmcp simulator stop --simulator-id $S --bundle-id "$PKG"
```

`snapshot-ui` exposes the React Native `testID` as the accessibility identifier, so `tap
--id <screen>-<element>` is the move. There is no wait verb: poll `snapshot-ui` for the
target route-root ID (`example-detail`, say) before tapping or screenshotting — a
screenshot taken before the next screen is in the tree is evidence of the previous one.
Pass `--style minimal` to drop the "next steps" chatter, `--output json` to parse.

The dev client is a local build: `yarn --cwd apps/mobile ios` the first time on a device
and after any native change (it runs `expo run:ios`: pods, Xcode build, install — ~5 min
warm — **and starts Metro itself**, so do not start a second one). Afterwards Metro plus
`launch-app` is enough. Launching the production bundle id succeeds and shows a stale
standalone build — read `$PKG` from `.env`, never type an id.

`snapshot-ui` also reads the Metro red box: a `Unable to resolve module …` label in the
tree means the checkout's `node_modules` lag its branch — `yarn install`, relaunch.

## Teardown

`simulator stop` the app, stop Metro if you started it, `xcrun simctl shutdown $S` only if
this loop booted it, `xcodebuildmcp daemon stop` (it also exits after 10 idle minutes; log
capture and recording live in it).

## iOS-specific facts

- The auth module's social sign-in returns through the custom scheme
  (`EXPO_PUBLIC_SCHEME`) via `ASWebAuthenticationSession`; the simulator shares the host's
  loopback, so `localhost:3000` is the server (`src/lib/config.ts`).
- The `.env` / Metro traps are the same as Android's (that reference, Traps).
