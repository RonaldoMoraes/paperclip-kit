import { API_MODE } from "./src/lib/config";

// Mock mode must be installed before Expo Router renders the first screen, so this runs
// above the entry import. The mode is read once, in `config.ts`, beside everything else
// the bundler inlines.
if (__DEV__ && API_MODE === "mock") {
  require("./src/lib/mock-mode/mocks").startMocks();
}

// Expo Router owns the entry point; app/_layout.tsx is the first file it renders.
import "expo-router/entry";
