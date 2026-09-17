import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@contracts/example/item";
import { ExampleDetail } from "./ExampleDetail";

type Props = Parameters<typeof ExampleDetail>[0];

const ITEM: Item = { id: "first", title: "First", note: "A note", done: false, updatedAt: "2026-01-01T00:00:00.000Z" };

const renderDetail = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    item: ITEM,
    onBack: vi.fn(),
    onSetDone: vi.fn(),
    pending: false,
    error: null,
    ...overrides,
  };
  render(<ExampleDetail {...props} />);
  return props;
};

const press = (testID: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(testID));

describe("ExampleDetail", () => {
  it("prints the item's own data and whether it is done", () => {
    renderDetail();
    expect(screen.getByTestId("example-detail-title")).toHaveTextContent("First");
    expect(screen.getByTestId("example-detail-note")).toHaveTextContent("A note");
    expect(screen.getByTestId("example-detail-updated")).toHaveTextContent(
      String(new Date(ITEM.updatedAt).getFullYear())
    );
    expect(screen.getByTestId("example-detail-status")).toHaveAttribute("aria-valuetext", "open");

    renderDetail({ item: { ...ITEM, done: true } });
    expect(screen.getAllByTestId("example-detail-status").at(-1)).toHaveAttribute("aria-valuetext", "done");
  });

  it("the toggle asks for the opposite of what it shows, never for a toggle the caller has to interpret", async () => {
    const open = renderDetail({ item: { ...ITEM, done: false } });
    await press("example-detail-toggle");
    expect(open.onSetDone).toHaveBeenCalledWith(true);

    const done = renderDetail({ item: { ...ITEM, done: true } });
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getAllByTestId("example-detail-toggle")[1]);
    expect(done.onSetDone).toHaveBeenCalledWith(false);
  });

  it("goes back", async () => {
    const { onBack } = renderDetail();

    await press("example-detail-back");

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // A write in flight refuses a second tap: the user leaves the pending state when the
  // server answers, not on the tap.
  it("holds the toggle while a write is in flight", async () => {
    const { onSetDone } = renderDetail({ pending: true });

    await press("example-detail-toggle");

    expect(onSetDone).not.toHaveBeenCalled();
  });

  // A refused write must not leave the user on a screen with nothing to act on: the reason
  // is on screen, announced, and the button is his again.
  it("shows a refused write's line as an alert, with the toggle still there to try again", async () => {
    const { onSetDone } = renderDetail({ error: "That didn't save." });

    expect(screen.getByTestId("example-detail-error")).toHaveRole("alert");
    expect(screen.getByTestId("example-detail-error")).toHaveTextContent("That didn't save.");
    await press("example-detail-toggle");

    expect(onSetDone).toHaveBeenCalledTimes(1);
  });
});
