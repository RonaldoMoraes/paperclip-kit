// Deliberate violation for the lint-guard canary: a fireEvent interaction.
import { fireEvent } from "@testing-library/react";

export function clickLikeAMachine(el: HTMLElement) {
  fireEvent.click(el);
}
