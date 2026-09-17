import { renderScreen } from "@test/renderScreen";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import AppLayout from "../../../../app/(app)/_layout";

/**
 * Which screens the app group puts in the stack. `Stack.Screen` stands in for the
 * navigator with nothing but its name: there is no navigator in jsdom, and what is under
 * test is that the tabs and the pushed detail are both reachable — a module that adds a
 * screen adds it beside them.
 */
vi.mock("expo-router", () => {
  const Stack = ({ children }: { children?: ReactNode }) => children;
  Stack.Screen = ({ name }: { name: string }) => <div data-testid={`stack-${name}`} />;
  Stack.Protected = ({ guard, children }: { guard: boolean; children?: ReactNode }) => (guard ? children : null);
  return { Stack };
});

const inStack = (name: string) => screen.queryByTestId(`stack-${name}`);

describe("app group layout", () => {
  it("opens the tabs and the pushed detail", () => {
    renderScreen(<AppLayout />);

    expect(inStack("(tabs)")).toBeInTheDocument();
    expect(inStack("example/[id]")).toBeInTheDocument();
  });
});
