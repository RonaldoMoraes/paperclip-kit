import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(__dirname, "../.env") });

export type ApiMode = "mock" | "live";

export function getEnv() {
  return {
    baseUrl: process.env.BASE_URL ?? "http://localhost:5173",
    apiMode: (process.env.E2E_API_MODE ?? "mock") as ApiMode,
  };
}
