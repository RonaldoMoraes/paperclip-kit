import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAt } from "~/testing/renderScreen";
import { Screen } from "./Screen";

/**
 * What every screen depends on the shell for and no other test would catch: the tag the
 * e2e suite asserts, and chrome/main/bar in that order.
 */
describe("Screen", () => {
  it("says which screen is on stage", async () => {
    await renderAt("/example", <Screen tag="example-list">content</Screen>);
    expect(window.__appScreen).toBe("example-list");
  });

  it("puts the chrome above main and the bar below it", async () => {
    await renderAt(
      "/example",
      <Screen
        tag="example-list"
        chrome={<header data-testid="probe-chrome">chrome</header>}
        bar={<footer data-testid="probe-bar">bar</footer>}
      >
        <p data-testid="probe-main">content</p>
      </Screen>
    );
    const [chrome, main, bar] = ["probe-chrome", "probe-main", "probe-bar"].map((id) => screen.getByTestId(id));
    expect(chrome.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
