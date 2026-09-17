import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@contracts/example/item";
import { ExampleList } from "./ExampleList";

const ITEMS: Item[] = [
  { id: "first", title: "First", note: "A note", done: false, updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "second", title: "Second", note: "", done: true, updatedAt: "2026-01-02T00:00:00.000Z" },
  { id: "third", title: "Third", note: "", done: false, updatedAt: "2026-01-03T00:00:00.000Z" },
];

const press = (testID: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(testID));

const renderList = (items = ITEMS, lastVisitedId: string | null = null) => {
  const onOpen = vi.fn();
  render(<ExampleList items={items} lastVisitedId={lastVisitedId} onOpen={onOpen} />);
  return { onOpen };
};

describe("ExampleList", () => {
  it("derives every filter count from the rows — a done row drops open and counts done", () => {
    renderList();

    expect(screen.getByTestId("example-list-count-all")).toHaveTextContent("3");
    expect(screen.getByTestId("example-list-count-open")).toHaveTextContent("2");
    expect(screen.getByTestId("example-list-count-done")).toHaveTextContent("1");
    expect(screen.getByTestId("example-list-row-done-second")).toBeInTheDocument();
    expect(screen.queryByTestId("example-list-row-done-first")).toBeNull();
  });

  it("the done pill lists exactly what is done", async () => {
    renderList();

    await press("example-list-filter-done");

    expect(screen.getByTestId("example-list-filter-done")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("example-list-row-second")).toBeInTheDocument();
    expect(screen.queryByTestId("example-list-row-first")).toBeNull();
  });

  // An empty filter is a state, not an absence: the screen says so and offers the way back
  // to the whole list rather than a blank field under the pills.
  it("an empty filter explains itself and offers the way back to the whole list", async () => {
    renderList(ITEMS.filter((item) => !item.done));

    await press("example-list-filter-done");
    expect(screen.getByTestId("example-list-empty")).toBeInTheDocument();

    await press("example-list-empty-cta");

    expect(screen.queryByTestId("example-list-empty")).toBeNull();
    expect(screen.getByTestId("example-list-filter-all")).toHaveAttribute("aria-selected", "true");
  });

  it("marks the row this device opened last, and only that one", () => {
    renderList(ITEMS, "third");

    expect(screen.getByTestId("example-list-row-last-third")).toBeInTheDocument();
    expect(screen.queryByTestId("example-list-row-last-first")).toBeNull();
  });

  it("a row asks to open its item", async () => {
    const { onOpen } = renderList();

    await press("example-list-row-first");

    expect(onOpen).toHaveBeenCalledWith("first");
  });
});
