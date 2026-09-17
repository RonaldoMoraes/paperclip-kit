import { render } from "@testing-library/react";
import { Text } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsScreenViews } from "./ScreenViews";

/**
 * The navigator and the transport are the seams: `useSegments` says where the user is,
 * `~/lib/analytics` hears what this component makes of it. Bare `render`: the component
 * touches no provider.
 */
let segments: string[] = [];
const track = vi.fn();

vi.mock("expo-router", () => ({ useSegments: () => segments }));
vi.mock("~/lib/analytics", () => ({ useAnalytics: () => ({ track }) }));

const viewed = () => track.mock.calls.map(([event]) => event);

describe("AnalyticsScreenViews", () => {
  beforeEach(() => {
    segments = [];
  });

  it("reports the screen from the route's segments, once per screen, never the parameter's value", () => {
    segments = ["(app)", "(tabs)", "example"];
    const { rerender } = render(
      <AnalyticsScreenViews>
        <Text testID="child">on stage</Text>
      </AnalyticsScreenViews>
    );
    rerender(
      <AnalyticsScreenViews>
        <Text testID="child">still on stage</Text>
      </AnalyticsScreenViews>
    );

    segments = ["(app)", "example", "[id]"];
    rerender(
      <AnalyticsScreenViews>
        <Text testID="child">the item</Text>
      </AnalyticsScreenViews>
    );

    expect(viewed()).toEqual([
      { type: "screen-viewed", screen: "example" },
      { type: "screen-viewed", screen: "example-id" },
    ]);
  });

  // The index route is where the gates decide; it renders nothing and is not a screen.
  it("reports nothing for the index, and renders its children either way", () => {
    const { getByTestId } = render(
      <AnalyticsScreenViews>
        <Text testID="child">deciding</Text>
      </AnalyticsScreenViews>
    );

    expect(getByTestId("child")).toBeInTheDocument();
    expect(track).not.toHaveBeenCalled();
  });
});
