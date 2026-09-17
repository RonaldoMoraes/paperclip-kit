import { describe, expect, it } from "vitest";
import { fill } from "./fill";

describe("fill", () => {
  it("replaces each named slot with the supplied value, anywhere in the sentence", () => {
    expect(fill("Item {n} of {total}", { n: 3, total: 12 })).toBe("Item 3 of 12");
    expect(fill("{name} is done, {name}.", { name: "Alex" })).toBe("Alex is done, Alex.");
  });

  it("stringifies numbers, including zero", () => {
    expect(fill("{n} items left", { n: 0 })).toBe("0 items left");
  });

  it("leaves an unknown slot visible — a typo anyone can spot, never an empty gap", () => {
    expect(fill("Told {name} about {topic}", { name: "Alex" })).toBe("Told Alex about {topic}");
  });

  it("touches nothing in a string without slots", () => {
    expect(fill("No slots here.", { unused: "x" })).toBe("No slots here.");
  });
});
