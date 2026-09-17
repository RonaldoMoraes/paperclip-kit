import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

type Props = Parameters<typeof Settings>[0];

const ACTIONS = [
  { id: "ping", label: "Ping" },
  { id: "leave", label: "Leave", tone: "danger" as const },
];

const renderSettings = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    actions: ACTIONS,
    version: "1.2.0 (34)",
    onRun: vi.fn(),
    pending: null,
    error: null,
    ...overrides,
  };
  render(<Settings {...props} />);
  return props;
};

const press = (testID: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(testID));

describe("Settings", () => {
  it("renders one row per module action, in order, and the version", () => {
    renderSettings();

    const ping = screen.getByTestId("settings-action-ping");
    const leave = screen.getByTestId("settings-action-leave");
    expect(ping).toHaveTextContent("Ping");
    expect(leave).toHaveTextContent("Leave");
    expect(ping.compareDocumentPosition(leave) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("settings-version")).toHaveTextContent("1.2.0 (34)");
    expect(screen.queryByTestId("settings-no-actions")).toBeNull();
  });

  it("runs the row the user tapped", async () => {
    const { onRun } = renderSettings();

    await press("settings-action-leave");

    expect(onRun).toHaveBeenCalledWith("leave");
  });

  // One thing at a time: while a row runs, every row waits, and the running one says so.
  it("holds every row while one runs, and marks the one that is", async () => {
    const { onRun } = renderSettings({ pending: "ping" });

    expect(screen.getByTestId("settings-action-ping")).toHaveAttribute("aria-busy", "true");
    await press("settings-action-leave");

    expect(onRun).not.toHaveBeenCalled();
  });

  it("names a row that failed", () => {
    renderSettings({ error: "Something went wrong. Try again." });

    expect(screen.getByTestId("settings-error")).toHaveTextContent("Something went wrong");
  });

  // A base product has no module yet: the tab says so rather than showing a bare version line.
  it("says when no module has put anything here", () => {
    renderSettings({ actions: [] });

    expect(screen.getByTestId("settings-no-actions")).toBeInTheDocument();
  });
});
