import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const envDir = resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  // Through `loadEnv` so the product's own `.env` is read, not only an exported shell
  // variable; the environment still wins over the file.
  const devHost = (process.env.VITE_DEV_HOST ?? loadEnv(mode, envDir, "VITE_").VITE_DEV_HOST)?.trim();
  // The /api proxy must target the port the server actually binds — PORT in the same
  // `.env` — or a stack on non-default ports (a worktree slot) proxies into the void.
  const serverPort = (process.env.PORT ?? loadEnv(mode, envDir, "").PORT ?? "3000").trim();
  // The version the settings screen prints: the root package.json's, at build time.
  const { version } = JSON.parse(readFileSync(resolve(envDir, "package.json"), "utf8")) as { version: string };

  return {
    root: resolve(__dirname),
    // The product's one `.env` (beside `.env.example`) holds the VITE_* values too.
    envDir,
    plugins: [
      // Before react(): the plugin writes routeTree.gen.ts, and react() has to see the
      // routes it generates. The tree is generated, never committed — `yarn routes:generate`
      // (tsr, `tsr.config.json` beside this file) writes it for `tsc --noEmit` and vitest.
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: resolve(__dirname, "src/app/routes"),
        generatedRouteTree: resolve(__dirname, "src/app/routeTree.gen.ts"),
      }),
      react(),
    ],
    resolve: {
      alias: {
        "~": resolve(__dirname, "src"),
        "@ui": resolve(__dirname, "../../shared/ui"),
        "@contracts": resolve(__dirname, "../../shared/contracts"),
        "@domain": resolve(__dirname, "../../shared/domain"),
      },
    },
    // `import.meta.env.DEV` / `.PROD` follow the build's own mode, not NODE_ENV. Vite
    // otherwise derives them from a `NODE_ENV` line in the loaded `.env`, and the product's
    // `.env` carries `NODE_ENV=development` for the server: without this, a local
    // `yarn build` produces a bundle where `DEV` is true — the devtools render and every
    // other DEV-guarded branch ships — while CI, which has no `.env`, produces the opposite.
    // The artifact a developer builds has to be the artifact that deploys.
    define: {
      "import.meta.env.DEV": mode !== "production",
      "import.meta.env.PROD": mode === "production",
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
    },
    build: {
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      // Localhost only by default. `VITE_DEV_HOST` (in the product `.env`) names one LAN
      // hostname to bind for and accept — a phone or another machine reaching this dev
      // server. Whatever it names, the auth origin must name the same one the browser
      // uses, or a session cookie is set for a host nobody is on.
      host: !!devHost,
      allowedHosts: devHost ? [devHost] : undefined,
      port: 5173,
      // A taken port fails loudly instead of drifting to the next one: the e2e suite and
      // the worktree slots address this server by the port they were told.
      strictPort: true,
      proxy: {
        // Forward /api/* to the server during local dev
        "/api": {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
