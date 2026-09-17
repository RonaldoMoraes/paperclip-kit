import path from "node:path";
import { defineConfig } from "vitest/config";

// react-native runs as react-native-web, and the native modules the tested layers reach
// are stubbed rather than mocked per spec.
const stub = (name: string) => path.resolve(__dirname, "test/stubs", name);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: path.resolve(__dirname, "test/reactNative.tsx") },
      { find: /^react-native-safe-area-context$/, replacement: stub("safeAreaContext.tsx") },
      { find: /^lucide-react-native$/, replacement: stub("lucideReactNative.tsx") },
      { find: /^react-native-reanimated$/, replacement: stub("reanimated.tsx") },
      { find: /^react-native-svg$/, replacement: stub("reactNativeSvg.tsx") },
      { find: /^nativewind$/, replacement: stub("nativewind.ts") },
      { find: /^expo-constants$/, replacement: stub("expoConstants.ts") },
      // Matches the whole specifier, not the extension: a regex `find` replaces only what
      // it matched, so `/\.png$/` would leave the path sitting in front of the stub.
      { find: /^.*\.(?:png|jpg|mp4|ttf)$/, replacement: stub("mediaAsset.ts") },
      // `~` is `apps/mobile/src` and `@test` is `apps/mobile/test`, as tsconfig.json
      // declares them and Metro resolves them.
      { find: /^~\//, replacement: `${path.resolve(__dirname, "src")}/` },
      { find: /^@test\//, replacement: `${path.resolve(__dirname, "test")}/` },
      { find: /^@assets\//, replacement: `${path.resolve(__dirname, "assets")}/` },
      { find: "@ui", replacement: path.resolve(__dirname, "../../shared/ui") },
      { find: "@contracts", replacement: path.resolve(__dirname, "../../shared/contracts") },
      { find: "@domain", replacement: path.resolve(__dirname, "../../shared/domain") },
    ],
    // `.native` first, so `@ui/components/Button` resolves the platform split the device
    // would get and never the DOM component sitting beside it.
    extensions: [".native.tsx", ".native.ts", ".tsx", ".ts", ".native.js", ".js", ".json"],
  },
  esbuild: { jsx: "automatic" },
  define: { __DEV__: "true" },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // The app's own specs, plus the `.native` splits of the shared primitives — those
    // render react-native and only resolve under this project's aliases.
    //
    // `src/**` and never `app/**`: everything under `app/` is a route, and Expo Router's
    // ignore list has no entry for `.spec`, so a spec placed there becomes a screen and
    // pulls vitest into the bundle. A spec that drives a route lives under `src/` and
    // imports the route from `app/`.
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx", "../../shared/ui/**/*.native.spec.tsx"],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
