// Deliberately violates biome/revenuecat-sdk-imports.grit three ways: a static import
// outside the store seam, a dynamic one, and a type-only one. Copied into the lint path and
// linted by scripts/check-lint-guards.mjs; this directory is excluded from the normal lint
// in biome.json.
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import type { PurchasesPackage } from "react-native-purchases";

export const canary = [Purchases, LOG_LEVEL];
export const lazy = () => import("react-native-purchases");
export type Leaked = PurchasesPackage;
