// The real module reads the native manifest. What `src/lib/version.ts` prints from it is
// stated here so a spec can assert the label without a binary behind it.
const Constants = {
  expoConfig: { name: "App", version: "0.0.0" } as { name: string; version?: string },
  nativeBuildVersion: null as string | null,
};

export default Constants;
