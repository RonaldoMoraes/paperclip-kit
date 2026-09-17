import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fixture } from "@contracts/example/list-items.mock";
import { renderAt, routeTestId } from "~/testing/renderScreen";
import { ExampleList } from "./ExampleList";

// The seed is the one truth (`shared/contracts/example/mock-library.ts`: one item done,
// the rest open); every count here is derived from it, never written down.
const [first, , third] = fixture.items;
const done = fixture.items.filter((item) => item.done);
const open = fixture.items.filter((item) => !item.done);
const [firstDone] = done;
const [firstOpen] = open;

describe("ExampleList", () => {
  it("derives every filter count from the rows — a done row drops open and counts done", async () => {
    await renderAt("/example", <ExampleList items={fixture.items} lastVisitedId={null} />);
    expect(screen.getByTestId("example-list-count-all")).toHaveTextContent(String(fixture.items.length));
    expect(screen.getByTestId("example-list-count-open")).toHaveTextContent(String(open.length));
    expect(screen.getByTestId("example-list-count-done")).toHaveTextContent(String(done.length));
    expect(screen.getByTestId(`example-list-row-done-${firstDone.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`example-list-row-done-${firstOpen.id}`)).not.toBeInTheDocument();
  });

  it("the done pill lists exactly what is done", async () => {
    await renderAt("/example", <ExampleList items={fixture.items} lastVisitedId={null} />);
    await userEvent.click(screen.getByTestId("example-list-filter-done"));
    expect(screen.getByTestId("example-list-filter-done")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId(`example-list-row-${firstDone.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`example-list-row-${firstOpen.id}`)).not.toBeInTheDocument();
  });

  it("an empty filter explains itself and offers the way back to the whole list", async () => {
    // a library with nothing done: the done pill has nothing to show
    await renderAt("/example", <ExampleList items={open} lastVisitedId={null} />);
    await userEvent.click(screen.getByTestId("example-list-filter-done"));
    expect(screen.getByTestId("example-list-empty")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("example-list-empty-cta"));
    expect(screen.queryByTestId("example-list-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("example-list-filter-all")).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the row this device opened last, and only that one", async () => {
    await renderAt("/example", <ExampleList items={fixture.items} lastVisitedId={third.id} />);
    expect(screen.getByTestId(`example-list-row-last-${third.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`example-list-row-last-${first.id}`)).not.toBeInTheDocument();
  });

  it("a row opens its item", async () => {
    await renderAt("/example", <ExampleList items={fixture.items} lastVisitedId={null} />);
    await userEvent.click(screen.getByTestId(`example-list-row-${first.id}`));
    expect(await screen.findByTestId(routeTestId("/example/$id"))).toBeInTheDocument();
  });
});
