import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAt, routeTestId } from "~/testing/renderScreen";
import { TabBar, activeTab } from "./TabBar";

describe("TabBar", () => {
  // Named one by one on purpose: looping over the domain's list would agree with it
  // however that list changed. The count is on what rendered, so a third destination
  // fails here whatever it is called; the bar's own testid and the pill ride the same
  // `tab-` prefix and are what the pattern refuses.
  it("offers the destinations and nothing else", async () => {
    await renderAt("/example", <TabBar />);

    expect(screen.getByTestId("tab-example")).toBeInTheDocument();
    expect(screen.getByTestId("tab-settings")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^tab-(?!bar$|pill-)/)).toHaveLength(2);
  });

  // The pill and aria-current are the two signals of "you are here" — the pill for the
  // eye, aria-current for the reader. Both on the active destination, neither elsewhere.
  it("marks the destination the user is on, and only that one", async () => {
    await renderAt("/settings", <TabBar />);

    expect(screen.getByTestId("tab-pill-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-pill-example")).toBeNull();
    expect(screen.getByTestId("tab-settings")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("tab-example")).not.toHaveAttribute("aria-current");
  });

  // A detail page keeps its list lit — /example/<id> is inside the list, not a third place.
  it("keeps the list lit inside an item", async () => {
    await renderAt("/example/first-thing", <TabBar />);

    expect(screen.getByTestId("tab-pill-example")).toBeInTheDocument();
    expect(screen.getByTestId("tab-example")).toHaveAttribute("aria-current", "page");
  });

  // A route the bar has no destination for must not light one up: a highlighted tab on a
  // screen that is not that tab is worse than no highlight at all.
  it("highlights nothing on a route that is not a destination", async () => {
    await renderAt("/somewhere-else", <TabBar />);

    expect(screen.queryByTestId("tab-pill-example")).toBeNull();
    expect(screen.queryByTestId("tab-pill-settings")).toBeNull();
    expect(activeTab("/somewhere-else")).toBeUndefined();
  });

  // One shared layout id is what makes the pill TRAVEL between destinations instead of
  // cutting; jsdom cannot see the animation, so the spec pins the mechanism.
  it("gives the pill one shared layout id wherever it sits", async () => {
    const first = await renderAt("/example", <TabBar />);
    const idOnExample = screen.getByTestId("tab-pill-example").getAttribute("data-layout-id");
    first.unmount();

    await renderAt("/settings", <TabBar />);

    expect(idOnExample).toBeTruthy();
    expect(screen.getByTestId("tab-pill-settings").getAttribute("data-layout-id")).toBe(idOnExample);
  });

  it("opens the destination the user taps", async () => {
    await renderAt("/example", <TabBar />);

    await userEvent.click(screen.getByTestId("tab-settings"));

    expect(await screen.findByTestId(routeTestId("/settings"))).toBeInTheDocument();
  });
});
