# apps/mobile

Expo Router, NativeWind over the shared tokens, `msw/native` for mock mode. One product,
one app: the same contracts, domain and copy the web reads, rendered with native
primitives. Runs from the product root: `yarn mobile` (Metro against the server),
`yarn mobile:mock` (every `/api` answered by the contract mocks, no server);
`yarn --cwd apps/mobile android` / `ios` build the local dev client.

## The route map

```
index               → reads every module gate once and redirects: the first gate that
                      names a `redirectTo` wins, otherwise the first tab. Renders nothing
                      while a gate is pending — the native splash covers the wait
+not-found          → any URL the map does not have; redirects to index
(app)                                                     guard: every gate allows
  (tabs)            → example · settings, under the floating TabBar
    example         → the items (`useExampleItems`), the last-opened row marked
    settings        → the modules' rows (`KIT_SETTINGS_ACTIONS`) and the version
  example/[id]      → one item, pushed over the tabs; flips its flag. An id the server
                      does not carry redirects to the list — the honest answer to
                      "that one is gone"; any other failure is a screen to retry from
```

Base ships no gate, so the app group is open. A module adds a route file under `app/`
and it joins the stack (Expo Router lists every file); it adds a gate through
`kit.gen.tsx` and `app/_layout.tsx` guards the group on it — a screen whose guard turns
false is removed from the stack, history and all, so nothing navigates on a gate's behalf.
The auth module is the first: a `sign-in` route beside `index`, and a gate that answers
`{ ready: !pending, allow: signedIn, redirectTo: "/sign-in" }`.

The status bar is set by the route group from `useColorScheme()`, because a pinned style
leaves the clock invisible in one scheme. The [`TabBar`](../apps/mobile/src/features/shell/components/TabBar.tsx)
floats over the screens, so a tabbed screen pads its own bottom (`TAB_BAR_PAD`); its
destinations and order are `@domain/shell/tabs`, its labels `SHELL_COPY.tabs`, both
shared with the web's bar.

## The slots

[`src/kit.gen.tsx`](../apps/mobile/src/kit.gen.tsx) is written by the scaffold and holds
four lists, typed in [`src/kit.types.ts`](../apps/mobile/src/kit.types.ts):

| slot | where it acts |
| --- | --- |
| `KIT_BOOT` | once, before anything mounts (`app/_layout.tsx`); a throw is logged, never fatal |
| `KIT_PROVIDERS` | around the whole app, inside the query client and the safe-area provider |
| `KIT_GATES` | hooks read by `useAppGates()`; `allow` guards `(app)`, `ready` brings the splash down, `redirectTo` steers `index` |
| `KIT_SETTINGS_ACTIONS` | rows on the Settings tab, run one at a time by `useSettingsActions` |

A module that carries something on every request (the auth module's session cookie)
registers it from its boot step: `addRequestHeaders(() => ({ Cookie: … }))` in
[`src/lib/http.ts`](../apps/mobile/src/lib/http.ts). A React Native fetch has no jar, so
that header is the whole session; `credentials: "omit"` keeps the platform out of it.

## Routes read, screens render

The web's rule on the phone, where there are no loaders: the route mounts, reads its
hooks, branches once and hands props; the screen renders. A hook is transport, a plain
function is a decision, and a route file holds no `useState`, `useEffect` or
`useReducer` and no runtime import from `@domain/` — copy and rules reach the screen as
props from the hook that read them, or the screen imports its own section
([`route-no-logic.grit`](../biome/route-no-logic.grit)). A screen owns neither the status
bar nor the navigator ([`screen-chrome.grit`](../biome/screen-chrome.grit)): the route
sets the one from the scheme, and the other reaches the screen as `onBack` / `onOpen`. A
spec mocks the transport seam and never `~/features/*` or `@domain/*`
([`mock-seam.grit`](../biome/mock-seam.grit)).

The `example` feature is the reference for all of it, and mirrors the web's file for file
— the same screens, hooks, `derive.ts`, testIDs and copy keys, so `/feature <name>` clones
one shape on both surfaces. What differs is named here:

**Server state on a tab** is one `use<Feature>Facts` hook, the whole of what that tab
reads —
[`useExampleItems`](../apps/mobile/src/features/example/hooks/useExampleItems.ts) is the
reference. It calls the contract's `<name>Query(http)` factory and never re-declares a
query key: the factory owns the key and the freshness, and its `staleTime` wins over the
30s default in [`src/lib/queryClient.ts`](../apps/mobile/src/lib/queryClient.ts). Where the
web's loader (`ensureQueryData`) holds the wait and the failure, the phone's hook returns
them: a narrow discriminated result — `{ status: "pending" | "failed" | "ready", … }`,
plus `missing` for the one item — and the route branches on `status` once: `ScreenPending`
and `ScreenFailed` (`features/shell/components`) for the first two, a `Redirect` to the
list for `missing`, the screen for `ready`. The screen takes props and holds neither a
loading branch nor a failed one, so its spec renders the state it is testing directly. The
foreground refetch is already wired
([`src/lib/reactQueryNative.ts`](../apps/mobile/src/lib/reactQueryNative.ts)).

**Mutations** are the web's hook —
[`useExampleActions`](../apps/mobile/src/features/example/hooks/useExampleActions.ts): one
mutation scope per record so two flips never race, invalidating by feature key
(`["example"]`) rather than by endpoint, so one invalidation moves every read of that
feature. The hook hands the screen a void function, a flag and a line, never `mutate`
itself. Mutations run with `networkMode: "always"`: an offline write fails loudly rather
than pausing on a button that says "Saving…" forever.

**Device-side state** is [`src/data/store.ts`](../apps/mobile/src/data/store.ts), the
web's store's API (`useAppState`, `rememberVisitedItem`, `resetAll`) over process memory:
base ships no storage dependency on the phone, so the last-opened mark lives for the
launch. A persistent backing lands in that file's two seams and nowhere else; a screen
never reads the store — the route hands the value in as a prop.

**Failure copy** comes from the shared taxonomy,
[`shared/contracts/http-errors.ts`](../shared/contracts/http-errors.ts): the hook maps
the caught `HttpError` through `failureCopy`, never a string written at the catch site;
the contract's own refusal has its own line (`EXAMPLE_COPY.detail.refused`).

**Copy.** A screen reads its section from `@domain/copy` (`EXAMPLE_COPY`,
`SETTINGS_COPY`, `SHELL_COPY`) under the same keys the web reads, and holds no string of
its own — not a label, not a fallback. Inline marks (`*em*`, `**strong**`) render through
[`withMarks`](../apps/mobile/src/lib/copyMarks.tsx) as nested `Text`. Every handle is
`<screen>-<element>` (`example-list-row-<id>`, `example-detail-toggle`,
`settings-action-<id>`) — the web's ids, the element catalog's `mobile` fronts
(`tests/elements/*.yaml`), and what a device loop taps; a state a test asserts travels as
`aria-valuetext`, never as copy.

## Where things are

- **Config**: every `EXPO_PUBLIC_*` is catalogued in
  [`.env.example`](../apps/mobile/.env.example) and read in exactly one place
  ([`src/lib/config.ts`](../apps/mobile/src/lib/config.ts); `index.ts` for the run mode,
  `app.config.js` for native identity — [`expo-public-env.grit`](../biome/expo-public-env.grit)).
  Everything else imports the value.
- **Mock mode**: `EXPO_PUBLIC_API_MODE=mock` (`yarn mobile:mock`) installs
  [`src/lib/mock-mode/mocks.ts`](../apps/mobile/src/lib/mock-mode/mocks.ts) before the
  router mounts: `msw/native` over the contract's handlers (`shared/contracts/mocks.ts`,
  every module's through `KIT_HANDLERS`), an unmocked `/api` call an error, every answer
  logged as `[mock] METHOD /path → status`. Local debug builds only; a release binary
  ignores it. What a module must do at boot in mock mode is its own `KIT_BOOT` step.
- **Shared UI on the phone**: `@ui/<name>` resolves `<name>.native` first (tsconfig
  paths, vitest extensions, Metro). A shared component with no native split is web-only
  and [`mobile-ui-imports.grit`](../biome/mobile-ui-imports.grit) refuses it. Icons wear a
  token through `cssInterop` ([`src/lib/icons.ts`](../apps/mobile/src/lib/icons.ts)); a
  native prop that needs a colour string (a shadow, the splash) carries a comment naming
  the token it mirrors. A tuned spring names its `mass`
  ([`spring-mass.grit`](../biome/spring-mass.grit)).
- **Type**: Inter, one file per cut, registered in `app/_layout.tsx` under the names
  `tailwind.config.js` uses; nothing mounts until the faces resolve, because Android
  measures a label once. The theme is the web app's when `apps/web` exists, else the same
  names over `shared/ui/tokens.css`.
- **Specs**: every screen has a sibling spec (props in, `getByTestId` out); a hook spec
  renders a `Harness` and mocks `~/lib/http`; a route spec lives under
  `src/features/<f>/routes/` and mocks `expo-router`. The harness is `test/` —
  react-native runs as react-native-web, native modules are stubbed once in
  `vitest.config.ts`, never per spec. Accessibility travels as RN's `aria-*` props
  (`aria-selected`, `aria-busy`, `aria-valuetext`): react-native-web renders those and a
  spec can read them; `accessibilityState` it does not.

## Delivery

Three variants install side by side on one phone, one per EAS environment;
[`eas.json`](../apps/mobile/eas.json) names three profiles over them, all release
binaries that differ only in the environment they point at. Metro and the dev client
exist only in local runs: `yarn android` / `yarn ios` build a debug dev client for the
emulator or simulator on the machine's `.env`, and nothing on EAS ever opens a dev server.

| Profile | Variant | Binary | Installs from | Updates |
| --- | --- | --- | --- | --- |
| `development` | development | release, internal (APK, ad hoc IPA) | QR on registered devices | channel `development` |
| `preview` | preview | release, internal (APK, ad hoc IPA) | QR on registered devices | channel `preview` |
| `production` | production | release, store (AAB, App Store IPA) | TestFlight, Play internal track | channel `production` |

- **Identity is environment, not code.** `app.config.js` derives bundle id, scheme and
  display name from `MOBILE_VARIANT`, `MOBILE_BUNDLE_ID` and `EXPO_PUBLIC_SCHEME` (table
  in `.env.example`; development by default locally). On EAS each profile names its
  `environment`, and those three plus `EAS_PROJECT_ID` and `EXPO_PUBLIC_API_URL` (the
  deployed server for that environment) are set on that environment at expo.dev, so build,
  fingerprint and updates resolve the same config. A build with one unset fails in
  `app.config.js` rather than shipping under the wrong bundle id.
- **Runtime version is the fingerprint**: an update loads only on a binary whose native
  project hashes the same, so a native change — a new native module, a config plugin, a
  font embedded through `expo-font` — needs a new binary.
- **Phones only**: no iPad (`supportsTablet` off, telephony required) and no large
  screens on Android ([`plugins/withPhoneOnly.cjs`](../apps/mobile/plugins/withPhoneOnly.cjs)).
- **Workflows decide between a binary and an update.** One file per environment in
  [`.eas/workflows/`](../apps/mobile/.eas/workflows): fingerprint, reuse a finished build
  with that hash or build a new one; `production` also uploads to TestFlight and the Play
  internal track. Dispatch only: `yarn eas:workflow:<env>` or the GitHub action
  `Mobile Delivery` (`.github/workflows/mobile-delivery.yaml`, `EXPO_TOKEN` secret);
  `-F force_build=true` builds regardless.
- **EAS builds cost money.** `eas build`, `eas workflow:run` and `eas submit` spend the
  account's credits; the developer approves each specific build, in the conversation
  that asks for it, before it runs. Everything read-only (`eas build:list`,
  `channel:list`, `update:list`, `fingerprint:compare`, `workflow:validate`) is free —
  `.agents/skills/mobile/references/eas-release.md`.
- **Credentials live on EAS**, never in the repo; `eas credentials` manages them. Ad hoc
  iOS builds install only on devices registered with `eas device:create`. The credentials
  commands evaluate `app.config.js` without the EAS environment, so pass the identity
  inline:

  ```sh
  MOBILE_VARIANT=preview MOBILE_BUNDLE_ID=__BUNDLE_ID__.preview EXPO_PUBLIC_SCHEME=__SCHEME__-preview \
    eas credentials:configure-build -p ios -e preview
  ```

- **Assets** are placeholders until the product has a mark: `yarn assets:placeholders`
  redraws them (`scripts/render-placeholder-assets.mjs`), and the product's own PNGs
  replace them under the names `app.config.js` uses.
- `yarn doctor` runs `expo-doctor`; `yarn fetch-build <platform> <profile>` downloads the
  newest EAS build into `.expo/builds/` for Appium's `APP_PATH` (`tests/docs/appium.md`).
  Device proof — the Android emulator loop, the iOS simulator through XcodeBuildMCP — is
  the `mobile` skill under `.agents/skills/`.
