import "./mocks.polyfills";
import { setupServer } from "msw/native";
import { handlers } from "@contracts/mocks";

/**
 * Mock mode's network layer for the device: `msw/native` patches the fetch `http` uses.
 * The polyfills import must stay first — msw's interceptors read the globals it installs
 * at import time. An `/api` call with no mock is an error, not a fallthrough. Every mocked
 * answer is logged as `[mock] METHOD /path → status`, so the app's logcat is the record of
 * which endpoints a screen called.
 *
 * The handlers are the contract's (`shared/contracts/mocks.ts`): every module's mocks
 * arrive through `KIT_HANDLERS` there, never here. Anything a module has to do at boot in
 * mock mode — sign the mock user in, seed a store — is a `KIT_BOOT` step of its own,
 * gated on `API_MODE === "mock"`, so this file never learns a module's name. Mock state
 * that must survive a relaunch travels as a cookie the mocks set and read back
 * (`shared/contracts/mock-state.ts`); msw's own jar keeps it here.
 */
export function startMocks(): void {
  const server = setupServer(...handlers);
  server.events.on("response:mocked", ({ request, response }) => {
    console.info(`[mock] ${request.method} ${new URL(request.url).pathname} → ${response.status}`);
  });
  server.listen({
    // Metro, symbolication and the dev menu all go through the same fetch; only the app's
    // own API is anyone's business here.
    onUnhandledRequest(request, print) {
      if (new URL(request.url).pathname.startsWith("/api/")) print.error();
    },
  });
}
