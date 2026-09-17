import { getResponse } from "msw";
import { describe, expect, it } from "vitest";
import { handlers } from "./index";
import { fixture as listFixture } from "./list-items.mock";
import { ITEM_STATE_COOKIE } from "./mock-item-state";
import { MOCK_ITEMS } from "./mock-library";

const ORIGIN = "http://localhost";

/** One request through the handler list, the way the Playwright fixture and the apps drive it. */
async function call(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const { cookie, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await getResponse(handlers, new Request(`${ORIGIN}${path}`, { ...rest, headers }));
  if (!response) throw new Error(`no handler answered ${path}`);
  return response;
}

/** The `Cookie` header a jar would send back for the `Set-Cookie` an answer carried. */
function jarOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

describe("the example mocks", () => {
  it("list the seed with no state, so the fixture is the first answer", async () => {
    const response = await call("/api/example/items");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(listFixture);
  });

  it("read one item, and refuse an unknown id in the envelope", async () => {
    expect(await (await call(`/api/example/items/${MOCK_ITEMS[0].id}`)).json()).toEqual(MOCK_ITEMS[0]);
    const missing = await call("/api/example/items/nobody");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("write the done flag to the ledger cookie, and every later read applies it", async () => {
    const target = MOCK_ITEMS[1];
    const written = await call(`/api/example/items/${target.id}/done`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    expect(written.status).toBe(200);
    expect(await written.json()).toMatchObject({ id: target.id, done: true });
    const jar = jarOf(written);
    expect(jar).toContain(`${ITEM_STATE_COOKIE}=`);

    const list = await (await call("/api/example/items", { cookie: jar })).json();
    expect(list.items.find((item: { id: string }) => item.id === target.id)).toMatchObject({ done: true });
    expect(list.items.find((item: { id: string }) => item.id === MOCK_ITEMS[2].id)).toMatchObject({ done: false });
    expect(await (await call(`/api/example/items/${target.id}`, { cookie: jar })).json()).toMatchObject({ done: true });
  });

  it("carry an earlier write forward when a second one lands", async () => {
    const first = await call(`/api/example/items/${MOCK_ITEMS[1].id}/done`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    const second = await call(`/api/example/items/${MOCK_ITEMS[0].id}/done`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: false }),
      cookie: jarOf(first),
    });
    const list = await (await call("/api/example/items", { cookie: jarOf(second) })).json();
    expect(list.items.map((item: { done: boolean }) => item.done)).toEqual([false, true, false]);
  });

  it("refuse a write to an unknown id and a body the contract rejects", async () => {
    const missing = await call("/api/example/items/nobody/done", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    expect(missing.status).toBe(404);
    await expect(
      call(`/api/example/items/${MOCK_ITEMS[0].id}/done`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    ).rejects.toThrow();
  });
});
