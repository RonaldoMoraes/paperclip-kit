import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetLaunchForTest } from "../src/data/launch";
import { resetAll } from "../src/data/store";
import { resetTestPlatform } from "./platform";

afterEach(() => {
  cleanup();
  resetTestPlatform();
  resetLaunchForTest();
  resetAll();
});
