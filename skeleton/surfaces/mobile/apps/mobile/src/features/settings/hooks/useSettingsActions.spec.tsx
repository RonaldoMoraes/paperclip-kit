import { renderScreen } from "@test/renderScreen";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pressable, Text } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { useSettingsActions } from "./useSettingsActions";

/** Two rows stand in for two modules; each is read lazily so a test decides what it does. */
const ping = vi.fn<() => Promise<void>>();
const leave = vi.fn<() => Promise<void>>();

vi.mock("~/kit.gen", () => ({
  KIT_SETTINGS_ACTIONS: [
    { id: "ping", label: "Ping", run: () => ping() },
    { id: "leave", label: "Leave", tone: "danger", run: () => leave() },
  ],
}));

function Harness() {
  const { actions, run, pending, error } = useSettingsActions();
  return (
    <>
      <Text testID="pending">{pending ?? "-"}</Text>
      <Text testID="error">{error ?? "-"}</Text>
      {actions.map((action) => (
        <Pressable key={action.id} testID={`row-${action.id}`} onPress={() => run(action.id)}>
          <Text>{`${action.label}:${action.tone ?? "default"}:${"run" in action ? "leaked" : "clean"}`}</Text>
        </Pressable>
      ))}
    </>
  );
}

const press = (testID: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(testID));

describe("useSettingsActions", () => {
  // The screen gets a label and a tone and nothing it could call: the work stays behind `run`.
  it("lists the modules' rows without their work", () => {
    renderScreen(<Harness />);

    expect(screen.getByTestId("row-ping")).toHaveTextContent("Ping:default:clean");
    expect(screen.getByTestId("row-leave")).toHaveTextContent("Leave:danger:clean");
  });

  it("runs the row the user tapped, and says which one is running", async () => {
    let finish: () => void = () => undefined;
    ping.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    renderScreen(<Harness />);

    await press("row-ping");

    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("ping"));
    expect(ping).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("-"));
  });

  it("names a row that failed", async () => {
    leave.mockRejectedValue(new Error("refused"));
    renderScreen(<Harness />);

    await press("row-leave");

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("Something went wrong"));
  });
});
