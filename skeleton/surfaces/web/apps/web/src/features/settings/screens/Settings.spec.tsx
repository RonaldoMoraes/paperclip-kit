import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@contracts/http";
import type { SettingsAction } from "~/app/kit.types";
import { renderAt } from "~/testing/renderScreen";
import { Settings } from "./Settings";

describe("Settings", () => {
  it("prints the version and, with no module contributing, says there is nothing to manage", async () => {
    await renderAt("/settings", <Settings version="1.2.3" actions={[]} />);
    expect(screen.getByTestId("settings-version")).toHaveTextContent("1.2.3");
    expect(screen.getByTestId("settings-no-actions")).toBeInTheDocument();
  });

  it("renders one row per action, in order, under its id and tone", async () => {
    const actions: SettingsAction[] = [
      { id: "sign-out", label: "Sign out", run: vi.fn() },
      { id: "delete-account", label: "Delete my account", run: vi.fn(), tone: "danger" },
    ];
    await renderAt("/settings", <Settings version="dev" actions={actions} />);

    const signOut = screen.getByTestId("settings-action-sign-out");
    const remove = screen.getByTestId("settings-action-delete-account");
    expect(signOut).toHaveAttribute("data-tone", "default");
    expect(remove).toHaveAttribute("data-tone", "danger");
    expect(signOut.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId("settings-no-actions")).not.toBeInTheDocument();

    await userEvent.click(signOut);
    expect(actions[0].run).toHaveBeenCalledOnce();
    expect(actions[1].run).not.toHaveBeenCalled();
  });

  it("holds every row while one runs, so a slow action cannot be tapped twice", async () => {
    let finish = () => {};
    const slow: SettingsAction = {
      id: "slow",
      label: "Slow",
      run: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    };
    const other: SettingsAction = { id: "other", label: "Other", run: vi.fn() };
    await renderAt("/settings", <Settings version="dev" actions={[slow, other]} />);

    await userEvent.click(screen.getByTestId("settings-action-slow"));
    expect(screen.getByTestId("settings-action-slow")).toBeDisabled();
    expect(screen.getByTestId("settings-action-other")).toBeDisabled();

    finish();
    await waitFor(() => expect(screen.getByTestId("settings-action-other")).toBeEnabled());
  });

  // A module's row talks to the server on its own; when that refuses, the screen is the
  // only place the person could hear about it — silence would read as "it worked".
  it("says, under the rows, that an action refused", async () => {
    const refuses: SettingsAction = {
      id: "boom",
      label: "Boom",
      run: () => Promise.reject(new HttpError(500, "unavailable")),
    };
    await renderAt("/settings", <Settings version="dev" actions={[refuses]} />);
    expect(screen.queryByTestId("settings-action-error")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("settings-action-boom"));

    expect(await screen.findByTestId("settings-action-error")).toHaveTextContent(/try again/i);
  });

  it("drops the line when a later action goes through", async () => {
    const actions: SettingsAction[] = [
      { id: "boom", label: "Boom", run: () => Promise.reject(new HttpError(500, "unavailable")) },
      { id: "fine", label: "Fine", run: vi.fn() },
    ];
    await renderAt("/settings", <Settings version="dev" actions={actions} />);
    await userEvent.click(screen.getByTestId("settings-action-boom"));
    await screen.findByTestId("settings-action-error");

    await userEvent.click(screen.getByTestId("settings-action-fine"));

    await waitFor(() => expect(screen.queryByTestId("settings-action-error")).not.toBeInTheDocument());
    expect(actions[1].run).toHaveBeenCalledOnce();
  });
});
