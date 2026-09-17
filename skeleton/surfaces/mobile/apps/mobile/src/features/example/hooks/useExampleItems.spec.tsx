import { renderScreen } from "@test/renderScreen";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pressable, Text } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@contracts/http";
import { getState } from "~/data/store";
import { useExampleItem, useExampleItems } from "./useExampleItems";

/**
 * The transport is the seam: `http.get` is what the contract's query calls, and what it
 * answers is what the hook turns into a status. Nothing under the hook is mocked.
 */
const get = vi.fn<(path: string) => Promise<unknown>>();

vi.mock("~/lib/http", () => ({ http: { get: (path: string) => get(path) } }));

const ITEM = { id: "first", title: "First", note: "", done: false, updatedAt: "2026-01-01T00:00:00.000Z" };

function ListHarness() {
  const facts = useExampleItems();
  return (
    <>
      <Text testID="status">{facts.status}</Text>
      {facts.status === "ready" ? <Text testID="count">{String(facts.items.length)}</Text> : null}
      {facts.status === "failed" ? (
        <>
          <Text testID="failure">{facts.failure}</Text>
          <Pressable testID="retry" onPress={facts.retry}>
            <Text>retry</Text>
          </Pressable>
        </>
      ) : null}
    </>
  );
}

function ItemHarness({ id }: { id: string }) {
  const facts = useExampleItem(id);
  return (
    <>
      <Text testID="status">{facts.status}</Text>
      {facts.status === "ready" ? <Text testID="title">{facts.item.title}</Text> : null}
      {facts.status === "failed" ? <Text testID="failure">{facts.failure}</Text> : null}
    </>
  );
}

const press = (testID: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(testID));

describe("useExampleItems", () => {
  it("asks the contract's endpoint and reads the items off the answer", async () => {
    get.mockResolvedValue({ items: [ITEM] });
    renderScreen(<ListHarness />);

    expect(screen.getByTestId("status")).toHaveTextContent("pending");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(get).toHaveBeenCalledWith("/api/example/items");
  });

  // The sentence comes from the shared taxonomy, never from a catch site: a 503 reads as
  // the server's failure on every platform.
  it("says why when the read fails, and asks again on retry", async () => {
    get.mockRejectedValueOnce(new HttpError(503, "down")).mockResolvedValue({ items: [] });
    renderScreen(<ListHarness />);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("failed"));
    expect(screen.getByTestId("failure")).toHaveTextContent("Something went wrong on our end");

    await press("retry");

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("useExampleItem", () => {
  it("reads one item by its id, and remembers it as the one this device opened", async () => {
    get.mockResolvedValue(ITEM);
    renderScreen(<ItemHarness id="first" />);

    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("First"));
    expect(get).toHaveBeenCalledWith("/api/example/items/first");
    await waitFor(() => expect(getState().lastVisitedItemId).toBe("first"));
  });

  // A dead link is not a failure to retry from: the route sends the user back to the list.
  it("reads an id the server does not carry as missing, and remembers nothing", async () => {
    get.mockRejectedValue(new HttpError(404, "no such item", "NOT_FOUND"));
    renderScreen(<ItemHarness id="ghost" />);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("missing"));
    expect(getState().lastVisitedItemId).toBeNull();
  });

  it("names any other failure so the user can try the link again", async () => {
    get.mockRejectedValue(new HttpError(500, "down"));
    renderScreen(<ItemHarness id="first" />);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("failed"));
    expect(screen.getByTestId("failure")).toHaveTextContent("Something went wrong on our end");
  });
});
