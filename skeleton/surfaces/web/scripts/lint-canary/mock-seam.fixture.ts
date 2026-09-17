// Deliberate violation: a spec that mocks past the transport seam.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import { vi } from "vitest";

vi.mock("~/features/example/hooks/useExampleItems", () => ({ useExampleItems: () => ({ items: [] }) }));
vi.mock("@domain/copy", () => ({ EXAMPLE_COPY: {} }));
