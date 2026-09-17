/**
 * The device's analytics identity: one UUID, minted on first read, kept for good.
 *
 * This is the `anonymousId` every batch carries (`track-events.ts`) — the thread that lets
 * the server stitch the events a visitor produced before they had an account to the
 * account they eventually sign into. Re-minted between launches, every funnel would start
 * over.
 *
 * Where it is kept is the platform's business — `localStorage` on web, whatever the
 * device's `src/data` offers — and reaches this file as the `{ get, set }` seam. What it
 * must be is the contract's `z.uuid()`, so a stored value that fails that shape is
 * replaced. Nothing secret lives in it: it is a coin, kept so the same funnel hangs off
 * the same id.
 */

/** The contract's `z.uuid()` shape — a stored value that fails this is re-minted. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AnonymousIdStorage = {
  /** the stored id, or null; may answer synchronously — `localStorage` does */
  get: () => string | null | Promise<string | null>;
  /** keep the minted id; a store that refuses is caught here, never raised at the caller */
  set: (id: string) => void | Promise<void>;
};

function mintUuid(): string {
  // `randomUUID` is missing on insecure origins (a phone hitting a LAN dev server) and
  // Hermes ships no WebCrypto at all, so the bytes fall back as far as `Math.random`. The
  // id still comes out v4-shaped, because the contract validates the shape.
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The id this device reports under, read once and cached: every batch asks for it, and a
 * store that cannot be read or written keeps the id for this run only — stable within the
 * visit, new on the next one.
 */
export function createAnonymousId(storage: AnonymousIdStorage): () => Promise<string> {
  let cached: string | null = null;

  return async function anonymousId(): Promise<string> {
    if (cached) return cached;
    try {
      const stored = await storage.get();
      if (stored && UUID.test(stored)) {
        cached = stored;
        return stored;
      }
    } catch {
      /* the store refused the read — mint below, in memory only */
    }
    const id = mintUuid();
    cached = id;
    try {
      await storage.set(id);
    } catch {
      /* private mode, a locked store — this run still reports under one id */
    }
    return id;
  };
}
