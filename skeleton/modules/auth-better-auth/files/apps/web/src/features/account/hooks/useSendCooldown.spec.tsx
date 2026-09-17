import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEND_COOLDOWN_SECONDS } from "@contracts/auth/send-cooldown";
import { useSendCooldown } from "./useSendCooldown";

/** The hook touches no provider, so the harness renders bare. */
function Harness() {
  const { remaining, start } = useSendCooldown();
  return (
    <>
      <p data-testid="remaining">{remaining}</p>
      <button type="button" data-testid="start" onClick={start}>
        start
      </button>
    </>
  );
}

const remaining = () => screen.getByTestId("remaining");

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

    await userEvent.setup().click(screen.getByTestId("start"));
    await showsRemaining(SEND_COOLDOWN_SECONDS);

    runClock(5);
    await showsRemaining(SEND_COOLDOWN_SECONDS - 5);

    runClock(SEND_COOLDOWN_SECONDS);
    await showsRemaining(0);
  });

  // They switched to their mail and the browser throttled the tab's timers while they
  // were gone. The wait they come back to is the one the clock served, not the ticks.
  it("serves the wait that passed while the tab was not running it", async () => {
    render(<Harness />);

    await userEvent.setup().click(screen.getByTestId("start"));
    await showsRemaining(SEND_COOLDOWN_SECONDS);

    vi.setSystemTime(Date.now() + SEND_COOLDOWN_SECONDS * 1_000);
    runClock(1);

    await showsRemaining(0);
  });
});
