import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "./TabBar";

const press = (testID: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(testID));

describe("TabBar", () => {
  // Named one by one on purpose: looping over `TAB_DESTINATIONS` would agree with it
  // however that shared record changed, and the two are what the product ships. The count is
  // on what rendered, so a third tab fails here whatever it is called; the pill rides the
  // same `tab-` prefix and is the one thing the pattern has to refuse.
  it("offers the two destinations and nothing else", () => {
    render(<TabBar active="example" onSelect={vi.fn()} />);

    expect(screen.getByTestId("tab-example")).toBeInTheDocument();
    expect(screen.getByTestId("tab-settings")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^tab-(?!pill-)/)).toHaveLength(2);
  });

  // The pill is the only thing on screen that says where the user is; sitting it over the
  // wrong destination is a screen that lies about which tab it is.
  it("puts the pill on the active destination and only there", () => {
    render(<TabBar active="settings" onSelect={vi.fn()} />);

    expect(screen.getByTestId("tab-pill-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-pill-example")).toBeNull();
  });

  // A route the bar has no destination for must not light one up: a highlighted first tab
  // on a screen that is not it is worse than no highlight at all.
  it("highlights nothing when the route is not a destination", () => {
    render(<TabBar active={undefined} onSelect={vi.fn()} />);

    expect(screen.queryByTestId("tab-pill-example")).toBeNull();
    expect(screen.queryByTestId("tab-pill-settings")).toBeNull();
  });

  it("names the destination it is asked to open", async () => {
    const onSelect = vi.fn();
    render(<TabBar active="example" onSelect={onSelect} />);

    await press("tab-settings");

    expect(onSelect).toHaveBeenCalledWith("settings");
  });
});
