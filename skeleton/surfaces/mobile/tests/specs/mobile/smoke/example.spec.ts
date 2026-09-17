/// <reference types="@wdio/globals/types" />
/// <reference types="@wdio/mocha-framework" />
import { MOCK_ITEMS } from "../../../../shared/contracts/example/mock-library";
import { ExampleMobilePage } from "../../../pages/mobile/example.page";

/**
 * Smoke mobile — needs an Appium server, an emulator or simulator, and `APP_PATH`. Skips
 * itself when `APP_PATH` is unset so `yarn test:e2e:validate` and the web lanes stay green
 * on a machine with no device. The app under test runs in mock mode (a development build
 * started with `EXPO_PUBLIC_API_MODE=mock`), so the list is the contract's seed.
 */
describe("Example @smoke @mobile", () => {
  it("opens on the list with its rows, and a row opens its item", async function () {
    if (!process.env.APP_PATH) {
      this.skip();
      return;
    }

    // Arrange
    const example = new ExampleMobilePage(browser);
    const [first] = MOCK_ITEMS;

    // Act — the launch lands on the first tab
    await example.expectList();
    await example.expectCount("all", MOCK_ITEMS.length);
    await example.openRow(first.id);

    // Assert
    await example.expectDetail();
    await example.expectTitle(first.title);
  });
});
