// react-native is Flow-typed and Metro-resolved, so specs run react-native-web.
// Its Platform reports "web", which would send every Platform.OS branch down a path
// the app never takes on a device, so Platform is replaced here.
import { getTestPlatform } from "./platform";

export * from "react-native-web";

type PlatformSelectSpec<T> = {
  ios?: T;
  android?: T;
  native?: T;
  web?: T;
  default?: T;
};

export const Platform = {
  get OS() {
    return getTestPlatform();
  },
  get isTesting() {
    return true;
  },
  get Version() {
    return getTestPlatform() === "android" ? 34 : 18;
  },
  select<T>(spec: PlatformSelectSpec<T>): T | undefined {
    const os = getTestPlatform();
    if (os in spec) {
      return spec[os];
    }
    if (os !== "web" && "native" in spec) {
      return spec.native;
    }
    return spec.default;
  },
};
