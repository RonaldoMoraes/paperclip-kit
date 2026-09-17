import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GateResult } from "~/kit.types";
import Index from "../../../../app/index";

/**
 * Where a launch lands. One gate stands in for a module; `Redirect` stands in for the
 * navigator and prints where it was sent, which is the whole of what this route decides.
 */
const gate = vi.fn<() => GateResult>();

vi.mock("~/kit.gen", () => ({ KIT_GATES: [() => gate()] }));

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: unknown }) => (
    <div data-testid="redirect">{typeof href === "string" ? href : JSON.stringify(href)}</div>
  ),
}));

describe("index", () => {
  // The native splash covers the wait; drawing anything here would put a frame under it
  // that the redirect then replaces.
  it("renders nothing while a gate is pending", () => {
    gate.mockReturnValue({ ready: false, allow: false });
    render(<Index />);

    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("lands on the first tab when no gate objects", () => {
    gate.mockReturnValue({ ready: true, allow: true });
    render(<Index />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/(app)/(tabs)/example");
  });

  it("goes where a refusing gate sends it", () => {
    gate.mockReturnValue({ ready: true, allow: false, redirectTo: "/(app)/(tabs)/settings" });
    render(<Index />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/(app)/(tabs)/settings");
  });
});
