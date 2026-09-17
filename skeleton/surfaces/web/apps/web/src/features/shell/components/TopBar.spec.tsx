import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TOP_BAR_FADE_PX, TopBar, topBarMaterialOpacity } from "./TopBar";

describe("TopBar", () => {
  // No material until there is content behind it to separate from: at rest the wordmark
  // floats on the canvas and the material is fully transparent.
  it("has no material at the top of the page", () => {
    render(<TopBar />);

    expect(screen.getByTestId("top-bar-material")).toHaveStyle({ opacity: "0" });
  });

  // The mapping the material rides (`useTransform(scrollY, topBarMaterialOpacity)`):
  // fully in over the first 64px, clamped on both sides so overscroll never dims or
  // over-darkens the bar.
  it("fades the material fully in over the first 64px of scroll", () => {
    expect(topBarMaterialOpacity(0)).toBe(0);
    expect(topBarMaterialOpacity(TOP_BAR_FADE_PX / 2)).toBe(0.5);
    expect(topBarMaterialOpacity(TOP_BAR_FADE_PX)).toBe(1);
    expect(topBarMaterialOpacity(TOP_BAR_FADE_PX * 4)).toBe(1);
    expect(topBarMaterialOpacity(-8)).toBe(0);
  });
});
