import { setupWorker } from "msw/browser";
import { handlers } from "@contracts/mocks";

/**
 * Mock mode's network layer, imported dynamically by `main.tsx` so it never reaches a
 * production bundle. An `/api` call with no mock is an error, not a fallthrough.
 *
 * Every mocked answer is logged as `[mock] METHOD /path → status`: a service worker's
 * responses never reach the browser's network log, so the console is where a driver (or a
 * person) sees which endpoints a screen called. Mock state is cookies, and those are msw's
 * too — they live in `localStorage["__msw-cookie-store__"]`, not in DevTools' cookie list.
 */
export async function startMocks(): Promise<void> {
  const worker = setupWorker(...handlers);
  worker.events.on("response:mocked", ({ request, response }) => {
    console.info(`[mock] ${request.method} ${new URL(request.url).pathname} → ${response.status}`);
  });
  await worker.start({
    onUnhandledRequest(request, print) {
      if (new URL(request.url).pathname.startsWith("/api/")) print.error();
    },
    quiet: true,
  });
}
