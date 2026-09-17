import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "@contracts/example/get-item.mock";
import { renderAt, routeTestId } from "~/testing/renderScreen";
import { ExampleDetail } from "./ExampleDetail";

async function renderDetail(over: { done?: boolean; pending?: boolean; error?: string | null } = {}) {
  const onSetDone = vi.fn();
  await renderAt(
    `/example/${fixture.id}`,
    <ExampleDetail
      item={{ ...fixture, done: over.done ?? false }}
      onSetDone={onSetDone}
      pending={over.pending ?? false}
      error={over.error ?? null}
    />
  );
  return { onSetDone };
}

describe("ExampleDetail", () => {
  it("prints the item's own data", async () => {
    await renderDetail();
    expect(screen.getByTestId("example-detail-title")).toHaveTextContent(fixture.title);
    expect(screen.getByTestId("example-detail-note")).toHaveTextContent(fixture.note);
    expect(screen.getByTestId("example-detail-updated")).toHaveTextContent(
      String(new Date(fixture.updatedAt).getFullYear())
    );
  });

  it("the toggle asks for the opposite of what it shows, never for a toggle the caller has to interpret", async () => {
    const open = await renderDetail({ done: false });
    expect(screen.getByTestId("example-detail-toggle")).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByTestId("example-detail-toggle"));
    expect(open.onSetDone).toHaveBeenCalledWith(true);

    const done = await renderDetail({ done: true });
    await userEvent.click(screen.getAllByTestId("example-detail-toggle")[1]);
    expect(done.onSetDone).toHaveBeenCalledWith(false);
  });

  it("holds the toggle while a write is in flight", async () => {
    const { onSetDone } = await renderDetail({ pending: true });
    expect(screen.getByTestId("example-detail-toggle")).toBeDisabled();
    await userEvent.click(screen.getByTestId("example-detail-toggle"));
    expect(onSetDone).not.toHaveBeenCalled();
  });

  it("shows a refused write's line as an alert, with the toggle still there to try again", async () => {
    await renderDetail({ error: "That didn't save." });
    expect(screen.getByTestId("example-detail-error")).toHaveRole("alert");
    expect(screen.getByTestId("example-detail-error")).toHaveTextContent("That didn't save.");
    expect(screen.getByTestId("example-detail-toggle")).toBeEnabled();
  });

  it("the way back goes to the list", async () => {
    await renderDetail();
    await userEvent.click(screen.getByTestId("example-detail-back"));
    expect(await screen.findByTestId(routeTestId("/example"))).toBeInTheDocument();
  });
});
