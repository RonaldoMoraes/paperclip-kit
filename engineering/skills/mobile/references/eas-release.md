# EAS: inspect, build, update, submit

Run from `apps/mobile` (`eas` directly, or the `eas:*` scripts in its `package.json` via
`yarn --cwd apps/mobile <script>`). The model — three variants, hosted environments,
channels, what ships by OTA — is `docs/mobile.md`, Delivery. Reference:
[docs.expo.dev/eas](https://docs.expo.dev/eas/) — `eas.json` schema,
[workflows syntax](https://docs.expo.dev/eas/workflows/syntax/),
[update deployment](https://docs.expo.dev/eas-update/deployment/).

## Money rule

`eas build`, `eas workflow:run` and `eas submit` spend the account's credits (iOS
`m-medium` is the expensive one). **The developer approves this specific build, in this
conversation, before any of them runs.** "We'll need a build eventually" is not
approval. Everything under *Inspect* is free.

## Inspect (read-only)

```bash
eas whoami
eas build:list --limit 8 --non-interactive --json   # status, profile, appVersion, buildVersion
eas build:list --profile production --limit 3 --non-interactive
eas build:view <id>
eas channel:list --non-interactive                  # which branch each channel serves, last update
eas update:list --branch <channel> --limit 3 --non-interactive
eas env:list --environment <development|preview|production>
eas workflow:list ; eas workflow:validate .eas/workflows/<file>.yml ; eas workflow:view [run-id]
eas build:version:get --platform <ios|android> --profile production   # appVersionSource is remote
eas fingerprint:compare --build-id <id> --environment <env>
```

`--non-interactive` is not accepted by every command (`workflow:list` rejects it); drop
it when a command complains.

## First time on a project

`eas init` creates the project on expo.dev and prints its id; put it in `.env` as
`EAS_PROJECT_ID` and on every EAS environment (`eas env:create`), beside `MOBILE_VARIANT`,
`MOBILE_BUNDLE_ID`, `EXPO_PUBLIC_SCHEME` and `EXPO_PUBLIC_API_URL` — `app.config.js`
refuses an EAS build with any of them unset. Credentials: `eas credentials -p ios` (App
Store Connect API key for the ad hoc refresh, distribution certificate) and `-p android`
(upload keystore, Play service account for submit); the identity goes inline
(`docs/mobile.md`, Delivery).

## Ship a change — the workflows

`.eas/workflows/{development,preview,production}.yml` are dispatch-only (no push
trigger). Each fingerprints the native project; per platform, if a finished build with
that fingerprint exists it publishes an OTA update to the channel, otherwise it builds —
and `production` submits each fresh build to the stores. `-F force_build=true` forces a
binary.

```bash
eas workflow:validate .eas/workflows/production.yml     # free, always first
yarn --cwd apps/mobile eas:workflow:prod                # after approval
```

Before any build or workflow run: `eas build:list` for a NEW / IN_QUEUE / IN_PROGRESS
build of the same profile — reuse or `eas build:cancel` it, never double. Killing the
local CLI does not cancel a server build. Batch native additions into one approved build.

## Build and submit by hand

| Want | Script |
| --- | --- |
| Dev client, one platform | `eas:build:dev:android`, `eas:build:dev:ios` |
| Internal preview, both | `eas:build:preview` |
| Store binaries, both | `eas:build:prod`, then the workflow's submit — or `eas submit -p <platform> --latest` |

The `preview` and `production` scripts pass `--no-wait`; poll with `eas build:list`.
`autoIncrement` bumps the build number on the remote; bump the marketing version in
`app.config.js` (`version`) before a store release.

## OTA update

1. Prove it is OTA-safe: `eas fingerprint:compare --build-id <id> --environment <env>`
   against the newest finished build on the channel. `--environment` is required —
   without it the local `.env` produces a false mismatch on app name, scheme and origin.
   Mismatch ⇒ binary.
2. `eas:update:dev` → verify on the installed development build → `eas:update:preview` →
   `eas:update:prod`, the same commit through all three.
3. A custom message: `eas update --channel <env> --environment <env> --message "..."`.

## Roll back

`eas update:rollback` on the channel, or `eas update:republish` a known-good group. A
broken binary is rolled back by submitting the previous build (`eas submit --id
<build-id>`).

## Writing or changing a workflow

Job types used here: `fingerprint`, `get-build` (`fingerprint_hash`,
`wait_for_in_progress`), `update`, `build`, `testflight`, `submit`. Others available:
`maestro`, `require-approval`, `slack`, `update-rollout`. Inputs:
`on.workflow_dispatch.inputs` → `${{ inputs.x }}`, passed with `-F x=value`. `eas
workflow:validate` after every edit; the three files share one shape, so change all three
together.
