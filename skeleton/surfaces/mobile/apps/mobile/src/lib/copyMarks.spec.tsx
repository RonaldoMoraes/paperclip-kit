import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { describe, expect, it } from "vitest";
import { withMarks } from "./copyMarks";

describe("withMarks", () => {
  it("hands plain copy back as the string it was", () => {
    expect(withMarks("Nothing to stress here.", { em: "text-ink-brand" })).toBe("Nothing to stress here.");
  });

  // The marks are the copy layer's notation, never something the user reads: what lands
  // on screen is the sentence with its stressed runs as their own Text nodes.
  it("renders the stressed runs without their marks", () => {
    render(<Text testID="line">{withMarks("Your *items*, **all** of them", { em: "e", strong: "s" })}</Text>);

    expect(screen.getByTestId("line")).toHaveTextContent("Your items, all of them");
    expect(screen.getByTestId("line").textContent).not.toContain("*");
  });
});
