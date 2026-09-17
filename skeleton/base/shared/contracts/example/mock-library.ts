import { z } from "zod";
import { Item } from "./item";

/**
 * The three seed items — the one list the memory store, every `.mock.ts` and the e2e
 * suite start from. Parsed at import so a fixture that drifts from the schema throws
 * before any test or screen reads it.
 */
export const MOCK_ITEMS = z.array(Item).parse([
  {
    id: "read-the-architecture",
    title: "Read the architecture note",
    note: "docs/architecture.md says where each kind of code lives and why.",
    done: true,
    updatedAt: "2026-01-05T09:00:00.000Z",
  },
  {
    id: "run-the-gates",
    title: "Run every gate once",
    note: "typecheck, lint, guards, test, contract, e2e — green before the first feature.",
    done: false,
    updatedAt: "2026-01-05T09:05:00.000Z",
  },
  {
    id: "clone-the-example",
    title: "Clone the example feature",
    note: "/feature copies this feature across every layer; rename, then replace.",
    done: false,
    updatedAt: "2026-01-05T09:10:00.000Z",
  },
]);
