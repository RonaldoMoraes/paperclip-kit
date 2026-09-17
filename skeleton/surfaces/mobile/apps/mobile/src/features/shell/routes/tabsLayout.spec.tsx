import { renderScreen } from "@test/renderScreen";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShellTabBar } from "../../../../app/(app)/(tabs)/_layout";

/**
 * The adapter between the navigator and the floating bar. `TabBar.spec.tsx` proves the bar
 * offers the destinations and highlights the right one; what is left here is the wiring —
 * the tap that navigates, and a route the bar has no destination for.
 */
const navigate = vi.fn();

vi.mock("expo-router", () => ({ Tabs: () => null }));

/** the navigator, as the adapter reads it: which route is on top, and the way to another */
const onRoute = (name: string) => ({ state: { index: 0, routes: [{ name }] }, navigation: { navigate } });

const press = (testID: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(testID));

describe("ShellTabBar", () => {
  it("opens the destination the user tapped", async () => {
    renderScreen(<ShellTabBar {...onRoute("example")} />);

    await press("tab-settings");

    expect(navigate).toHaveBeenCalledWith("settings");
  });

  // A route the shell has no destination for — a module's screen mounted under the tabs —
  // highlights nothing rather than lighting the first tab.
  it("highlights nothing on a route that is not a destination", () => {
    renderScreen(<ShellTabBar {...onRoute("something-else")} />);

    expect(screen.queryByTestId("tab-pill-example")).toBeNull();
    expect(screen.queryByTestId("tab-pill-settings")).toBeNull();
  });
});
