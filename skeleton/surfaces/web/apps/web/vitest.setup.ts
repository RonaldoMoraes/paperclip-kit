import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// With Vitest globals off, testing-library cannot self-register its cleanup —
// without this, every render mounts NEXT TO the previous test's tree.
afterEach(() => {
  cleanup();
});

// jsdom is missing the browser APIs the screens lean on — shim what motion and scroll
// management touch at render time.

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

class ObserverStub {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
window.IntersectionObserver = window.IntersectionObserver ?? (ObserverStub as typeof IntersectionObserver);
window.ResizeObserver = window.ResizeObserver ?? (ObserverStub as typeof ResizeObserver);

// unconditional: jsdom DEFINES these but they throw "Not implemented"
window.scrollTo = vi.fn();
window.scrollBy = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

// jsdom has no media pipeline: autoplay must not throw
window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
window.HTMLMediaElement.prototype.pause = vi.fn();
