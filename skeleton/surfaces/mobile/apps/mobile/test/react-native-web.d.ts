// react-native-web ships no type declarations. It is only ever reached through the
// `react-native` alias in vitest.config.ts, and every consumer of that alias is typed
// against react-native's own declarations, so an untyped shim is enough here.
declare module "react-native-web";
