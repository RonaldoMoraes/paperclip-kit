import "react-native-url-polyfill/auto";
import "fast-text-encoding";
import { Event as ShimEvent, EventTarget as ShimEventTarget } from "event-target-shim";

/**
 * What msw's interceptors expect to find on the global before they load, and React
 * Native's runtime does not ship: a WHATWG `URL` with search params, `TextEncoder`, and
 * the DOM event family — `Event`, `EventTarget`, `MessageEvent` and `BroadcastChannel`,
 * which msw's WebSocket layer subclasses or constructs at import time. The app never
 * mocks WebSockets, so the channel is inert. Only the mock-mode entry imports this module.
 */
const g = globalThis as Record<string, unknown>;

if (typeof g.Event === "undefined") g.Event = ShimEvent;
if (typeof g.EventTarget === "undefined") g.EventTarget = ShimEventTarget;

const Base = g.Event as typeof ShimEvent;
const Target = g.EventTarget as typeof ShimEventTarget;

if (typeof g.MessageEvent === "undefined") {
  g.MessageEvent = class MessageEvent extends Base {
    readonly data: unknown;
    constructor(type: string, init?: { data?: unknown; bubbles?: boolean; cancelable?: boolean }) {
      super(type, init);
      this.data = init?.data;
    }
  };
}

if (typeof g.BroadcastChannel === "undefined") {
  g.BroadcastChannel = class BroadcastChannel extends Target {
    constructor(readonly name: string) {
      super();
    }
    postMessage(): void {}
    close(): void {}
  };
}

/**
 * React Native's `Response` (whatwg-fetch) has no `body` property. msw's fetch
 * interceptor rebuilds every mocked response as `new Response(raw.body, …)`, so without
 * one the app receives an empty body from every mock. This getter hands back the string
 * whatwg kept, which is a body `Response` accepts on this runtime.
 */
type WhatwgResponse = Response & { _bodyInit?: unknown; _bodyText?: string };
const proto: WhatwgResponse = globalThis.Response.prototype;
if (!("body" in proto)) {
  Object.defineProperty(proto, "body", {
    get(this: WhatwgResponse) {
      if (typeof this._bodyInit === "string") return this._bodyInit;
      return this._bodyText || null;
    },
    configurable: true,
  });
}
