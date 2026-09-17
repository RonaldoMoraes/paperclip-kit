import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { withMarks } from "./copyMarks";

describe("withMarks", () => {
  it("hands plain text back as the same string", () => {
    expect(withMarks("Nothing to see.", { em: "x" })).toBe("Nothing to see.");
  });

  it("dresses the two marks in the classes the screen passes, leaving the rest as text", () => {
    render(
      <p data-testid="line">{withMarks("The *first* thing and the **second**.", { em: "accent", strong: "bold" })}</p>
    );

    const line = screen.getByTestId("line");
    expect(line).toHaveTextContent("The first thing and the second.");
    // the marks themselves never reach the page
    expect(line.textContent).not.toContain("*");
    expect(line.innerHTML).toContain('<em class="accent">first</em>');
    expect(line.innerHTML).toContain('<strong class="bold">second</strong>');
  });
});
