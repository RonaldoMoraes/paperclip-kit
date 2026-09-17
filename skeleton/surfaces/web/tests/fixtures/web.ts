import { type Request as PlaywrightRequest, test as base, expect } from "@playwright/test";
import { getResponse } from "msw";
import { handlers } from "../../shared/contracts/mocks";

type ApiMock = {
  status?: number;
  json?: unknown;
  /** hold the response this long before answering — for a state that is about the wait */
  delayMs?: number;
};

export type Api = {
  /** add or override mocks for this test: "METHOD /path" → response */
  mock: (entries: Record<string, ApiMock>) => void;
};

const liveApi = process.env.E2E_API_MODE === "live";

/**
 * Hermetic API for the suite: every `/api` call is answered by the same msw handlers the
 * app runs in mock mode (`shared/contracts/mocks.ts`), so an endpoint is mocked here the
 * moment its `.mock.ts` exists and nothing in this file lists one.
 *
 * `api.mock()` is checked first: a spec's entry for "METHOD /path" wins over the handler
 * that would otherwise answer. A call no entry and no handler matches fails the test, so
 * does a resolver that throws, and so does an uncaught page error.
 *
 * E2E_API_MODE=live → no routing; `api.mock` is a no-op (local only, not CI).
 */
export const test = base.extend<{ api: Api }>({
  // auto: hermetic routing must run even when the spec only uses `{ page }`
  api: [
    async ({ page }, use) => {
      if (liveApi) {
        await use({ mock: () => undefined });
        return;
      }

      const context = page.context();

      // One cookie read per page load rather than per request: `context.cookies()` is an
      // IPC round trip. Everything that changes the jar drops the cache — our own
      // `Set-Cookie`, and any navigation, which covers a spec seeding cookies before it
      // opens the screen.
      const jar = new Map<string, Promise<string>>();
      const cookieHeader = (url: string) => {
        const origin = new URL(url).origin;
        const cached = jar.get(origin);
        if (cached) return cached;
        const header = context.cookies(origin).then((cookies) => cookies.map((c) => `${c.name}=${c.value}`).join("; "));
        jar.set(origin, header);
        return header;
      };
      page.on("framenavigated", () => jar.clear());

      const overrides = new Map<string, ApiMock>();
      const unmocked: string[] = [];
      const failed: string[] = [];
      const pageErrors: string[] = [];

      page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));

      await page.route(
        (url) => url.pathname.startsWith("/api/"),
        async (route) => {
          const request = route.request();
          const key = `${request.method()} ${new URL(request.url()).pathname}`;

          const override = overrides.get(key);
          if (override) {
            if (override.delayMs) await new Promise((resolve) => setTimeout(resolve, override.delayMs));
            return route.fulfill({
              status: override.status ?? 200,
              contentType: "application/json",
              // Preserve JSON `null`. `??` would turn it into `{}`.
              body: JSON.stringify(override.json === undefined ? {} : override.json),
            });
          }

          try {
            const mocked = await getResponse(handlers, await asRequest(request, cookieHeader));
            if (!mocked) {
              unmocked.push(key);
              return route.fulfill({ status: 599, contentType: "application/json", body: '{"error":"UNMOCKED"}' });
            }
            const headers = headersOf(mocked);
            if (headers["set-cookie"]) jar.clear();
            return route.fulfill({ status: mocked.status, headers, body: await mocked.text() });
          } catch (error) {
            // A mock that throws is broken, not slow: the call is answered and the cause
            // reported here, instead of being left to time out a navigation.
            failed.push(`${key}: ${String(error).slice(0, 300)}`);
            return route.fulfill({ status: 599, contentType: "application/json", body: '{"error":"MOCK_FAILED"}' });
          }
        }
      );

      await use({
        mock: (entries) => {
          for (const [k, v] of Object.entries(entries)) overrides.set(k, v);
        },
      });

      const problems = [
        ...unmocked.map((key) => `no mock for ${key}`),
        ...failed.map((entry) => `mock threw for ${entry}`),
        ...pageErrors.map((error) => `page error: ${error}`),
      ];
      expect(problems, `The run left ${problems.length} unanswered:\n  ${problems.join("\n  ")}`).toEqual([]);
    },
    { auto: true },
  ],
});

/**
 * The intercepted call as a `Request` the handlers can resolve, with the browser's cookies
 * on it: the mocks read every piece of mock state off the `cookie` header, and an
 * intercepted request does not carry one. `headers()` and not `allHeaders()` — the mocks
 * read the method, the path, the body and that one header, none of which the browser adds
 * late.
 */
async function asRequest(request: PlaywrightRequest, cookieHeader: (url: string) => Promise<string>): Promise<Request> {
  const url = request.url();
  const headers = { ...request.headers(), cookie: await cookieHeader(url) };
  const body = request.postData();
  return new Request(url, { method: request.method(), headers, body: body ?? undefined });
}

/**
 * `Set-Cookie` is carried through so the browser keeps what a mock hands back — a flag
 * flipped is still flipped after a reload. `route.fulfill` takes one header map; multiple
 * cookies ride one value joined with `\n`, which Playwright splits back into separate
 * headers. The reload assertions are what prove the cookies land.
 */
function headersOf(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") headers[name] = value;
  });
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) headers["set-cookie"] = setCookies.join("\n");
  return headers;
}

export { expect };
