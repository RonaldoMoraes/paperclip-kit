import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { MOCK_ITEMS } from "@contracts/example/mock-library";
import { ApiException } from "../common/api-error";
import { ExampleController } from "./example.controller";
import { MemoryExampleStore } from "./example.store.memory";

const controller = () => new ExampleController(new MemoryExampleStore(MOCK_ITEMS));
const first = MOCK_ITEMS[0];

describe("ExampleController", () => {
  it("lists the seed the contract's fixture holds", async () => {
    await expect(controller().list()).resolves.toEqual({ items: MOCK_ITEMS });
  });

  it("reads one item by id", async () => {
    await expect(controller().read({ id: first.id })).resolves.toEqual(first);
  });

  it("a write is visible to the next read, with a fresh timestamp", async () => {
    const held = controller();
    const before = Date.now();

    const written = await held.setDone({ id: first.id }, { done: !first.done });

    expect(written.done).toBe(!first.done);
    expect(Date.parse(written.updatedAt)).toBeGreaterThanOrEqual(before);
    await expect(held.read({ id: first.id })).resolves.toEqual(written);
  });

  it("answers an unknown id with the envelope's NOT_FOUND, never a bare 404", async () => {
    const failure = controller().read({ id: "nobody" });
    await expect(failure).rejects.toBeInstanceOf(ApiException);
    await expect(failure).rejects.toMatchObject({ response: { code: "NOT_FOUND" } });
    await expect(controller().setDone({ id: "nobody" }, { done: true })).rejects.toMatchObject({
      response: { code: "NOT_FOUND" },
    });
  });

  it("never hands a caller the stored object itself", async () => {
    const held = controller();
    const { items } = await held.list();
    items[0].title = "mutated";
    await expect(held.read({ id: first.id })).resolves.toMatchObject({ title: first.title });
  });
});
