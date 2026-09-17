import { describe, expect, it } from "vitest";
import { loadDatabaseConfig } from "./database.config";

describe("loadDatabaseConfig", () => {
  it("takes the URL the environment sets, trimmed", () => {
    expect(loadDatabaseConfig({ DATABASE_URL: " postgresql://db:5432/notes " })).toEqual({
      url: "postgresql://db:5432/notes",
    });
  });

  it("falls back to the local database rather than failing the boot", () => {
    const local = "postgresql://postgres:postgres@localhost:5432/__DB_NAME__";
    expect(loadDatabaseConfig({}).url).toBe(local);
    expect(loadDatabaseConfig({ DATABASE_URL: "   " }).url).toBe(local);
  });
});
