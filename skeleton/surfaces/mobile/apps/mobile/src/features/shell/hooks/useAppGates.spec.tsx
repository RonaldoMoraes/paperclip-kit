import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { describe, expect, it, vi } from "vitest";
import type { GateResult } from "~/kit.types";
import { useAppGates } from "./useAppGates";

/**
 * Two gates stand in for two modules. Each is read lazily so a test sets what it answers;
 * the generated file itself is the seam, and the aggregation is what is under test.
 */
const first = vi.fn<() => GateResult>();
const second = vi.fn<() => GateResult>();

vi.mock("~/kit.gen", () => ({ KIT_GATES: [() => first(), () => second()] }));

function Harness() {
  const { ready, allow, redirectTo } = useAppGates();
  return (
    <>
      <Text testID="ready">{String(ready)}</Text>
      <Text testID="allow">{String(allow)}</Text>
      <Text testID="redirect">{redirectTo === undefined ? "-" : String(redirectTo)}</Text>
    </>
  );
}

const OPEN: GateResult = { ready: true, allow: true };

describe("useAppGates", () => {
  it("is ready and open only when every gate is", () => {
    first.mockReturnValue(OPEN);
    second.mockReturnValue(OPEN);
    render(<Harness />);

    expect(screen.getByTestId("ready")).toHaveTextContent("true");
    expect(screen.getByTestId("allow")).toHaveTextContent("true");
    expect(screen.getByTestId("redirect")).toHaveTextContent("-");
  });

  // A gate still deciding holds the whole app: the splash stays up rather than a group
  // opening on a guess and closing under the user a moment later.
  it("waits while any gate is pending", () => {
    first.mockReturnValue(OPEN);
    second.mockReturnValue({ ready: false, allow: false });
    render(<Harness />);

    expect(screen.getByTestId("ready")).toHaveTextContent("false");
    expect(screen.getByTestId("allow")).toHaveTextContent("false");
  });

  // The first refusal names the destination; a later gate's is not read past it, so two
  // modules refusing at once send the user one way, in the order the manifest lists them.
  it("closes the app on one refusal and sends the user where the first refusing gate says", () => {
    first.mockReturnValue({ ready: true, allow: false, redirectTo: "/(app)/(tabs)/settings" });
    second.mockReturnValue({ ready: true, allow: false, redirectTo: "/(app)/(tabs)/example" });
    render(<Harness />);

    expect(screen.getByTestId("allow")).toHaveTextContent("false");
    expect(screen.getByTestId("redirect")).toHaveTextContent("/(app)/(tabs)/settings");
  });
});
