import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SentryBoundary } from "./SentryBoundary";

const DSN = "https://key@o0.ingest.sentry.io/1";

/** A child that throws while `live.armed`, so a spec can crash a render and then let it recover. */
function Bomb({ live }: { live: { armed: boolean } }) {
  if (live.armed) throw new Error("render failed");
  return <span data-testid="child" />;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SentryBoundary", () => {
  it("renders its children as they are when the build carries no DSN", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");

    render(
      <SentryBoundary>
        <span data-testid="child" />
      </SentryBoundary>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("with a DSN, turns a render crash into the crash screen, and Try again mounts the tree afresh", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", DSN);
    // React reports a caught render error on the console; the boundary is the claim here.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const live = { armed: true };

    render(
      <SentryBoundary>
        <Bomb live={live} />
      </SentryBoundary>
    );

    expect(screen.getByTestId("crash-title")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();

    live.armed = false;
    await userEvent.click(screen.getByTestId("crash-retry"));

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("crash-title")).not.toBeInTheDocument();
  });
});
