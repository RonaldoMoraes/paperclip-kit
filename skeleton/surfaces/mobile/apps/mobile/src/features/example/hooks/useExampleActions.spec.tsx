import { renderScreen } from "@test/renderScreen";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pressable, Text } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@contracts/http";
import { useExampleActions } from "./useExampleActions";
import { useExampleItems } from "./useExampleItems";

const get = vi.fn<(path: string) => Promise<unknown>>();
const put = vi.fn<(path: string, body: unknown) => Promise<unknown>>();

vi.mock("~/lib/http", () => ({
  http: {
    get: (path: string) => get(path),
    put: (path: string, _schema: unknown, body: unknown) => put(path, body),
  },
}));

const ITEM = { id: "first", title: "First", note: "", done: false, updatedAt: "2026-01-01T00:00:00.000Z" };

/** The detail's action beside the list's read, so an invalidation can be seen reaching the list. */
function Harness() {
  const list = useExampleItems();
  const { setDone, pending, error } = useExampleActions();
  return (
    <>
      <Text testID="list">{list.status}</Text>
      <Text testID="pending">{String(pending)}</Text>
      <Text testID="error">{error ?? "-"}</Text>
      <Pressable testID="done" onPress={() => setDone("first", true)}>
        <Text>done</Text>
      </Pressable>
      <Pressable testID="open" onPress={() => setDone("first", false)}>
        <Text>open</Text>
      </Pressable>
    </>
  );
}

const press = (testID: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(testID));

/** the body the transport was handed for `id`, per call, oldest first */
const bodiesFor = (id: string) =>
  put.mock.calls.filter(([path]) => path === `/api/example/items/${id}/done`).map(([, body]) => body);

describe("useExampleActions", () => {
  it("writes the flag the user chose to the contract's endpoint, and moves every read of the feature", async () => {
    get.mockResolvedValue({ items: [ITEM] });
    put.mockResolvedValue({ ...ITEM, done: true });
    renderScreen(<Harness />);
    await waitFor(() => expect(screen.getByTestId("list")).toHaveTextContent("ready"));

    await press("done");

    await waitFor(() => expect(bodiesFor("first")).toEqual([{ done: true }]));
    // the list's key is under ["example"], so the invalidation asks for it again
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("error")).toHaveTextContent("-");
  });

  // A refused write reaches the screen as a line from the shared taxonomy, and the next
  // attempt clears it — nothing here retries on the user's behalf.
  it("reads a refused write as a line, and the next attempt clears it", async () => {
    get.mockResolvedValue({ items: [ITEM] });
    put
      .mockRejectedValueOnce(new HttpError(409, "already done", "CONFLICT"))
      .mockResolvedValue({ ...ITEM, done: false });
    renderScreen(<Harness />);

    await press("done");
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("already been done"));
    expect(screen.getByTestId("pending")).toHaveTextContent("false");

    await press("open");

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("-"));
  });
});
