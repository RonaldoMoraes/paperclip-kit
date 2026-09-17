import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@contracts/http";
import { useExampleActions } from "~/features/example/hooks/useExampleActions";
import { renderAt } from "~/testing/renderScreen";

const put = vi.fn();

vi.mock("~/lib/http", () => ({
  http: {
    get: (...args: unknown[]) => Promise.reject(new Error(`unexpected GET ${String(args[0])}`)),
    put: (...args: unknown[]) => put(...args),
  },
}));

function Harness({ id }: { id: string }) {
  const { setDone, pending, error } = useExampleActions();
  return (
    <div>
      <button type="button" data-testid="harness-done" disabled={pending} onClick={() => setDone(id, true)}>
        done
      </button>
      <button type="button" data-testid="harness-open" disabled={pending} onClick={() => setDone(id, false)}>
        open
      </button>
      {error ? <p data-testid="harness-error">{error}</p> : null}
    </div>
  );
}

/** the body the transport was handed for `id`, per call, oldest first */
const bodiesFor = (id: string) =>
  put.mock.calls.filter(([path]) => path === `/api/example/items/${id}/done`).map(([, , body]) => body);

const answered = { id: "first-thing", title: "t", note: "", done: true, updatedAt: "2026-09-01T00:00:00.000Z" };

describe("the example actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    put.mockResolvedValue(answered);
  });

  it("writes the flag the user chose, exactly as the wire sees it", async () => {
    await renderAt("/example/first-thing", <Harness id="first-thing" />);
    await userEvent.click(screen.getByTestId("harness-done"));
    await userEvent.click(screen.getByTestId("harness-open"));
    await waitFor(() => expect(bodiesFor("first-thing")).toEqual([{ done: true }, { done: false }]));
    expect(screen.queryByTestId("harness-error")).not.toBeInTheDocument();
  });

  it("reads a refused write as a line, and the next attempt clears it", async () => {
    put.mockRejectedValueOnce(new HttpError(500, "unavailable"));
    await renderAt("/example/first-thing", <Harness id="first-thing" />);

    await userEvent.click(screen.getByTestId("harness-done"));
    expect(await screen.findByTestId("harness-error")).toHaveTextContent(/try again/i);

    await userEvent.click(screen.getByTestId("harness-done"));
    await waitFor(() => expect(screen.queryByTestId("harness-error")).not.toBeInTheDocument());
  });

  it("serializes writes: a second flip waits for the first to settle", async () => {
    // Arrange — the first write held open by the test
    let release = () => {};
    put.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(answered);
        })
    );
    await renderAt("/example/first-thing", <Harness id="first-thing" />);

    // Act — a flip while the first is still in flight; the harness disables its buttons on
    // `pending`, so the second goes out only once the first settles
    await userEvent.click(screen.getByTestId("harness-done"));
    await waitFor(() => expect(screen.getByTestId("harness-open")).toBeDisabled());
    expect(bodiesFor("first-thing")).toEqual([{ done: true }]);

    release();
    await waitFor(() => expect(screen.getByTestId("harness-open")).toBeEnabled());
    await userEvent.click(screen.getByTestId("harness-open"));
    await waitFor(() => expect(bodiesFor("first-thing")).toEqual([{ done: true }, { done: false }]));
  });
});
