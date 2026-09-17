// Three variants of this app install side by side on one device — development, preview,
// production — so the identity below comes from the environment, one set per EAS
// environment (`eas env:list`). A local run takes the development values; an EAS build
// with any of them unset fails here, because a wrong default would ship under the
// production bundle id.
const isEasBuild = process.env.EAS_BUILD === "true";

const VARIANTS = {
  development: { name: "__PRODUCT_NAME__ (Dev)" },
  preview: { name: "__PRODUCT_NAME__ (Preview)" },
  production: { name: "__PRODUCT_NAME__" },
};

// What an EAS build cannot guess: the variant, its bundle id, its deep-link scheme, and the
// EAS project the updates come from. Each is set on the matching environment at expo.dev.
const EAS_REQUIRED = ["MOBILE_VARIANT", "MOBILE_BUNDLE_ID", "EXPO_PUBLIC_SCHEME", "EAS_PROJECT_ID"];

function readIdentity() {
  const variant = process.env.MOBILE_VARIANT || "development";
  const scheme = process.env.EXPO_PUBLIC_SCHEME || "__SCHEME__-dev";
  const bundleId = process.env.MOBILE_BUNDLE_ID || "__BUNDLE_ID__.dev";

  if (!VARIANTS[variant]) {
    throw new Error(`MOBILE_VARIANT must be one of ${Object.keys(VARIANTS).join(", ")}; got "${variant}".`);
  }
  if (isEasBuild) {
    const missing = EAS_REQUIRED.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(
        `EAS build without ${missing.join(", ")}. These have no fallback on EAS — set them on the matching ` +
          "environment at expo.dev (see .env.example)."
      );
    }
  }
  return { variant, scheme, bundleId, name: VARIANTS[variant].name };
}

const { variant, scheme, bundleId, name } = readIdentity();
const isDevelopmentVariant = variant === "development";

// The EAS project this app belongs to: `eas init` creates it and prints the id. Unset until
// then, which only costs the updates URL — a local run never loads an update.
const easProjectId = process.env.EAS_PROJECT_ID || null;

// A native option takes a colour string, not a class. This is the immersive ground the
// placeholder assets are drawn on (`scripts/render-placeholder-assets.mjs`); when the
// product's tokens land in shared/ui/tokens.css, this value follows them in the same change.
const SPLASH_GROUND = "#0F172A";

export default {
  expo: {
    name,
    slug: "__PRODUCT_SLUG__",
    // The store-facing version; the build number is EAS-managed (`appVersionSource: remote`).
    version: "1.0.0",
    orientation: "portrait",
    // Placeholders until the product has a mark: `yarn assets:placeholders` redraws them.
    icon: "./assets/icon/icon.png",
    scheme,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    // An update may only load on a binary whose native project hashes the same, so a
    // native change can never meet an update that predates it.
    runtimeVersion: { policy: "fingerprint" },
    ...(easProjectId ? { updates: { url: `https://u.expo.dev/${easProjectId}` } } : {}),
    experiments: {
      // Metro resolves native modules to the same copy autolinking builds — what keeps a
      // workspace whose react-native is hoisted to the repo root from linking two copies.
      autolinkingModuleResolution: true,
      // Every `href` is checked against the route tree. The generated union lives in
      // `.expo/types/router.d.ts` (gitignored); the `typecheck` script regenerates it
      // with `expo customize tsconfig.json` before running `tsc`.
      typedRoutes: true,
      // Every `~`, `@assets`, `@ui`, `@contracts` and `@domain` import resolves from
      // `tsconfig.json`'s `paths`. Default in SDK 54; stated so the app never inherits it silently.
      tsconfigPaths: true,
    },
    plugins: [
      "expo-router",
      [
        // The dev client only exists in the local debug builds `yarn ios` / `yarn android`
        // make; every EAS profile, development included, is a release binary and never
        // opens a dev server. Its `exp+<slug>` scheme is registered on the development
        // variant only, and by variant rather than by build host so the fingerprint job
        // and the build hash the same native project.
        "expo-dev-client",
        { addGeneratedScheme: isDevelopmentVariant },
      ],
      // The faces load at runtime through `useFonts` (app/_layout.tsx). Listing files here
      // embeds them in the binary instead — `["expo-font", { fonts: [...] }]` — which is a
      // native change and a new build.
      "expo-font",
      [
        "expo-splash-screen",
        {
          backgroundColor: SPLASH_GROUND,
          image: "./assets/splash-icon.png",
          imageWidth: 160,
        },
      ],
      "./plugins/withPhoneOnly.cjs",
    ],
    ios: {
      supportsTablet: false,
      bundleIdentifier: bundleId,
      // Standard TLS only, no custom cryptography — the App Store export-compliance
      // answer is always "exempt", so builds must not prompt for it.
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        // `supportsTablet: false` still lets an iPad install the iPhone build in
        // compatibility mode; requiring telephony is what keeps it off the iPad App Store.
        UIRequiredDeviceCapabilities: ["arm64", "telephony"],
      },
    },
    android: {
      package: bundleId,
      edgeToEdgeEnabled: true,
      adaptiveIcon: {
        foregroundImage: "./assets/icon/adaptive-foreground.png",
        monochromeImage: "./assets/icon/adaptive-monochrome.png",
        backgroundColor: SPLASH_GROUND,
      },
    },
    web: {
      bundler: "metro",
      output: "single",
    },
    ...(easProjectId ? { extra: { eas: { projectId: easProjectId } } } : {}),
  },
};
