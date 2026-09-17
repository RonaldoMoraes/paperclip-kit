import { renderScreen } from "@test/renderScreen";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pressable, Text } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSignOut } from "./useSignOut";

const clientSignOut = vi.fn();
const refetchSession = vi.fn();
const sessionData = vi.fn();

vi.mock("~/lib/auth", () => ({
  authClient: {
    signOut: () => clientSignOut(),
    useSession: () => ({ data: sessionData(), refetch: refetchSession }),
    $store: { notify: () => undefined },
  },
}));

function Harness() {
  const { signOut: leave, pending, error } = useSignOut();
  return (
    <>
      <Text testID="pending">{String(pending)}</Text>
      <Text testID="error">{error ?? "-"}</Text>
      <Pressable testID="leave" disabled={pending} onPress={leave}>
        <Text>sign out</Text>
      </Pressable>
    </>
  );
}

const press = () => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId("leave"));

describe("useSignOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionData.mockReturnValue({ session: { id: "1" } });
    clientSignOut.mockResolvedValue({ error: null });
    refetchSession.mockResolvedValue(undefined);
  });

  // The request is quick and the session flip is not: the button speaks for the whole
  // wait, until the session is gone and the screen with it.
  it("stays pending after the request lands, until the session is gone", async () => {
    const { rerender } = renderScreen(<Harness />);

    await press();

    await waitFor(() => expect(refetchSession).toHaveBeenCalled());
    expect(screen.getByTestId("pending")).toHaveTextContent("true");

    sessionData.mockReturnValue(null);
    rerender(<Harness />);
    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("false"));
  });

  // A refused sign-out leaves the person somewhere they can act: the reason on screen, the
  // button theirs again, and the session untouched.
  it("keeps the person here with the reason when the server refuses", async () => {
    clientSignOut.mockResolvedValue({ error: { message: "Session store unavailable" } });
    renderScreen(<Harness />);

    await press();

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("Session store unavailable"));
    expect(screen.getByTestId("pending")).toHaveTextContent("false");
    expect(refetchSession).not.toHaveBeenCalled();
  });

  it("names a failure that never reached the mapping as a refused sign-out", async () => {
    clientSignOut.mockRejectedValue(new Error("socket hang up"));
    renderScreen(<Harness />);

    await press();

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("Couldn't sign out. Try again."));
  });
});
