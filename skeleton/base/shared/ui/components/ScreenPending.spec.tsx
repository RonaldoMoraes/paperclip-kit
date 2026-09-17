import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScreenPending } from "./ScreenPending";

describe("ScreenPending", () => {
  // The router mounts it over a screen the user is already looking at, so a screen reader
  // has to be told the app is busy rather than left to wonder why nothing answered.
  it("announces as a loading status", () => {
    render(<ScreenPending />);

    const pending = screen.getByTestId("screen-pending");
    expect(pending).toHaveRole("status");
    expect(pending).toHaveAccessibleName("Loading");
  });
});
