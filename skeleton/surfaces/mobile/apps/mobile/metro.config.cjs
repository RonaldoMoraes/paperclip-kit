const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// No watchFolders / nodeModulesPaths overrides: Expo SDK >= 52 configures monorepos
// on its own, and hand-rolled values here silently break resolution instead.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
