import Constants from "expo-constants";

/** The store-facing version from `app.config.js`, as the binary carries it. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

/** The build number EAS assigned (`appVersionSource: remote`); null in a run Metro serves. */
export const BUILD_NUMBER: string | null = Constants.nativeBuildVersion ?? null;

/** `1.2.0 (34)` — what Settings prints, and what a bug report quotes. */
export function versionLabel(): string {
  return BUILD_NUMBER ? `${APP_VERSION} (${BUILD_NUMBER})` : APP_VERSION;
}
