import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const sharedAliases = {
  "@contracts": resolve(__dirname, "shared/contracts"),
  "@domain": resolve(__dirname, "shared/domain"),
};

const webRoot = resolve(__dirname, "apps/web");
// The web surface is present when its Vite config is: `apps/web/` alone proves nothing — msw's
// postinstall creates `apps/web/public` for the worker in any tree that lists the directory.
const webConfig = resolve(webRoot, "vite.config.ts");

/**
 * The web project exists only when the web surface does: its plugin and setup file are the
 * surface's, so a server-only tree must not fail to load this config over a missing import.
 */
async function webProject() {
  const { default: react } = await import("@vitejs/plugin-react");
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "~": resolve(webRoot, "src"),
        "@ui": resolve(__dirname, "shared/ui"),
        ...sharedAliases,
      },
    },
    test: {
      name: "web",
      environment: "jsdom",
      // `*.native.spec.tsx` belongs to the mobile project: it renders the `.native` split,
      // which imports react-native and resolves nowhere in this one.
      include: ["apps/web/src/**/*.spec.{ts,tsx}", "shared/ui/**/*.spec.{ts,tsx}"],
      exclude: ["**/node_modules/**", "**/*.native.spec.{ts,tsx}"],
      setupFiles: [resolve(webRoot, "vitest.setup.ts")],
    },
  };
}

// Two projects, one per runtime: the NestJS server and the shared code it bundles run on
// node; the React web app runs on jsdom. `yarn test` runs both; mobile has its own config.
export default defineConfig(async () => ({
  test: {
    // One worker per core by default. A machine running several checkouts at once sets
    // VITEST_MAX_WORKERS to keep the whole run inside its memory budget.
    maxWorkers: process.env.VITEST_MAX_WORKERS ? Number(process.env.VITEST_MAX_WORKERS) : undefined,
    projects: [
      {
        resolve: { alias: sharedAliases },
        test: {
          name: "server",
          environment: "node",
          include: [
            "apps/server/src/**/*.spec.ts",
            "shared/contracts/**/*.spec.ts",
            "shared/domain/**/*.spec.ts",
            "scripts/**/*.spec.ts",
          ],
        },
      },
      ...(existsSync(webConfig) ? [await webProject()] : []),
    ],
  },
}));
