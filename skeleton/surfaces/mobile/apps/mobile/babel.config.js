module.exports = (api) => {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    // react-native-worklets/plugin backs react-native-reanimated 4 and must stay last.
    plugins: ["react-native-worklets/plugin"],
  };
};
