- **Copy is the reference's, key for key.** Every user-facing string lives in
  `shared/domain/<feature>/copy.ts`, read through `@domain/copy`, under the export name
  and key path the reference copy module uses (`COPY_DIFF_PATH`) — never hardcoded in a
  screen or component. A string the app alone needs goes in that feature's `*_APP_COPY`
  section with a reasoned entry in `scripts/copy-diff.allowlist.ts`; `yarn copy:diff`
  fails the build on any other drift, and an allowlisted divergence is a hold, not a fork.
