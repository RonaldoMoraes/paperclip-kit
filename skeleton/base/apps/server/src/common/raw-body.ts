/**
 * Why some paths arrive unparsed.
 *
 * A signed webhook (Stripe is the usual one) is verified by re-hashing the exact bytes the
 * sender wrote. Any parser that assigns `req.body` — `express.json`, `express.raw`, even
 * one that assigns `{}` — leaves a handler downstream re-serialising a value whose
 * whitespace and key order no longer match, and every delivery is rejected as forged. So
 * a raw-body path is not parsed at all: `req.body` stays `undefined` and the handler
 * streams the socket itself. The paths come from `app.modules.gen.ts` (`KIT_RAW_BODY_PATHS`).
 */

type Middleware<Q, S> = (req: Q, res: S, next: () => void) => void;

/** Whether a request path is one the manifest asked to keep raw. Exact match: a webhook has one path. */
export function isRawBodyPath(path: string, rawPaths: readonly string[]): boolean {
  return rawPaths.includes(path);
}

/**
 * `parse`, applied everywhere except `rawPaths`.
 *
 * A skipped request is passed straight along: nothing assigns `req.body`, which is the
 * whole point — an empty object would be re-serialised as `"{}"` just as readily as a
 * populated one.
 */
export function parseBodyExcept<Q, S>(parse: Middleware<Q, S>, rawPaths: readonly string[]): Middleware<Q, S> {
  return (req, res, next) => {
    // Generic over whatever the host hands its middleware — Express passes a full
    // `IncomingMessage`, and the path is the only thing this decision needs.
    const path = (req as { path?: unknown })?.path;
    if (typeof path === "string" && isRawBodyPath(path, rawPaths)) {
      next();
      return;
    }
    parse(req, res, next);
  };
}
