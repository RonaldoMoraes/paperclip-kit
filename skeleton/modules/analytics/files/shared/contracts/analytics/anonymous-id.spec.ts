import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type AnonymousIdStorage, createAnonymousId } from "./anonymous-id";

/** A store that keeps what it is given, like the platform ones do when they work. */
function memoryStorage(initial: string | null = null): AnonymousIdStorage & { held: () => string | null } {
  let held = initial;
  return {
    get: () => held,
    set: (id) => {
      held = id;
    },
    held: () => held,
  };
}

describe("createAnonymousId", () => {
  it("mints a contract-valid id and keeps it", async () => {
    const storage = memoryStorage();

    const id = await createAnonymousId(storage)();

    expect(() => z.uuid().parse(id)).not.toThrow();
    expect(storage.held()).toBe(id);
  });

  it("reads the store once and hands every batch the same id", async () => {
    const storage = memoryStorage();
    const get = vi.spyOn(storage, "get");
    const anonymousId = createAnonymousId(storage);

    expect(await anonymousId()).toBe(await anonymousId());
    expect(get).toHaveBeenCalledTimes(1);
  });

  // A second reader over the same store is what the next launch is: a fresh process, the
  // same storage.
  it("hands the next launch the id the last one kept", async () => {
    const storage = memoryStorage();
    const first = await createAnonymousId(storage)();

    expect(await createAnonymousId(storage)()).toBe(first);
  });

  it("replaces a stored value that is not an id", async () => {
    const storage = memoryStorage("not-a-uuid");

    const id = await createAnonymousId(storage)();

    expect(() => z.uuid().parse(id)).not.toThrow();
    expect(storage.held()).toBe(id);
  });

  // Private mode and a locked store both refuse. Analytics is never worth an error
  // reaching the product, so the run keeps one id and the next one starts over.
  it("keeps one id for the run when the store refuses to answer or to keep it", async () => {
    const refusing: AnonymousIdStorage = {
      get: () => {
        throw new Error("storage unavailable");
      },
      set: () => {
        throw new Error("storage unavailable");
      },
    };
    const anonymousId = createAnonymousId(refusing);

    const id = await anonymousId();
    expect(() => z.uuid().parse(id)).not.toThrow();
    expect(await anonymousId()).toBe(id);
  });
});
