import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pressable, Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEND_COOLDOWN_SECONDS } from "@contracts/auth/send-cooldown";
import { useSendCooldown } from "./useSendCooldown";

/** The hook touches no provider, so the harness renders bare. */
function Harness() {
  const { remaining, start } = useSendCooldown();
  return (
    <>
      <Text testID="remaining">{remaining}</Text>
      <Pressable testID="start" onPress={start}>
        <Text>start</Text>
      </Pressable>
    </>
  );
}

const remaining = () => screen.getByTestId("remaining");
const press = (testID: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(testID));

/**
 * Move the countdown's clock, then let `waitFor` observe what the tick rendered. The clock
 * is moved outside `waitFor` on purpose: advancing it inside the polled callback starves
 * the event loop, and the poll never ends.
 */
const runClock = (seconds: number) => vi.advanceTimersByTime(seconds * 1_000);

const showsRemaining = (seconds: number) => waitFor(() => expect(remaining()).toHaveTextContent(String(seconds)));

describe("useSendCooldown", () => {
  // Only the countdown's own clock is faked. `setTimeout` stays real because the testing
  // library waits on one internally — faking it deadlocks userEvent and waitFor alike.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts the whole wait down and then gives the buttons back", async () => {
    render(<Harness />);

    await press("start");
    await showsRemaining(SEND_COOLDOWN_SECONDS);

    runClock(5);
    await showsRemaining(SEND_COOLDOWN_SECONDS - 5);

    runClock(SEND_COOLDOWN_SECONDS);
    await showsRemaining(0);
  });

  // They left for their mail app, and the OS stopped the timer while they were gone. The
  // wait they come back to is the one the clock served, not the one the ticks did.
  it("serves the wait that passed while the app was not running it", async () => {
    render(<Harness />);

    await press("start");
    await showsRemaining(SEND_COOLDOWN_SECONDS);

    vi.setSystemTime(Date.now() + SEND_COOLDOWN_SECONDS * 1_000);
    runClock(1);

    await showsRemaining(0);
  });
});
