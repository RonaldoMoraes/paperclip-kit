const { resolve } = require("node:path");
const nodeExternals = require("webpack-node-externals");

// `nest build` (webpack mode, see nest-cli.json) bundles apps/server/src plus whatever it
// imports from shared/ into one file; node_modules stay external. Nest derives its output
// path from the tsconfig `outDir` relative to the cwd, which is the repo root here — this
// pins the bundle where `yarn start` and the Dockerfile expect it.
//
// One workspace is the exception to "external": `@__SCOPE__/db` (the db-prisma module's
// package) is TypeScript this repo emits, not something `node_modules` carries at runtime, so
// Nest's default `nodeExternals()` would leave the bundle a `require("@__SCOPE__/db")` that
// fails with MODULE_NOT_FOUND in the container. The allowlist bundles it; everything else stays out.
module.exports = (options) => ({
  ...options,
  externals: [nodeExternals({ allowlist: [/^@__SCOPE__\/db(\/|$)/] })],
  output: { ...options.output, path: resolve(__dirname, "apps/server/dist"), filename: "main.js" },
});
