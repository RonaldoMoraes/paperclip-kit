// Deliberate violation for the lint-guard canary: a hoisted mock and a partial "real" mock.
// Two distinct violations on purpose — each branch of the grit is proven alive.
import { vi } from "vitest";

const hoisted = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  send: hoisted.send,
}));
