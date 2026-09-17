import type { ZodType } from "zod";
import type { Http, JsonRequest } from "@contracts/http";
import { HttpError, httpErrorFrom, jsonRequest } from "@contracts/http";
import { API_URL } from "./config";

/**
 * The app's `Http`, and its one way to reach `apps/server`.
 *
 * Every data contract is handed this transport. Every response is parsed by its
 * `shared/contracts` schema, so a server that drifts from the contract fails here, at
 * the transport, rather than as a missing field inside a screen.
 *
 * A React Native fetch has no cookie jar, so a session cannot ride along on its own: a
 * module that holds one registers a header source below (the auth module's `KIT_BOOT`
 * hands over `authClient.getCookie()`), and `credentials: "omit"` keeps the platform's own
 * credential handling from interfering with a `Cookie` set by hand.
 *
 * A failure is read the same way on both platforms — `httpErrorFrom` is that decision, and
 * `jsonRequest` is the one place a body is serialised.
 */

/** Headers a module puts on every request. Read per request, so a session that lands later is carried. */
export type RequestHeaders = () => Record<string, string>;

const headerSources = new Set<RequestHeaders>();

/** Registers a header source; returns its removal. Called from a module's boot, never from a screen. */
export function addRequestHeaders(source: RequestHeaders): () => void {
  headerSources.add(source);
  return () => {
    headerSources.delete(source);
  };
}

function moduleHeaders(): Record<string, string> {
  let headers: Record<string, string> = {};
  for (const source of headerSources) headers = { ...headers, ...source() };
  return headers;
}

async function request<T>(path: string, schema: ZodType<T>, init: JsonRequest): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "omit",
    headers: { Accept: "application/json", ...moduleHeaders(), ...init.headers },
  });
  if (!response.ok) throw httpErrorFrom(path, response.status, await response.json().catch(() => null));
  return schema.parse(await response.json());
}

export const http: Http = {
  get: (path, schema) => request(path, schema, jsonRequest.get()),
  post: (path, schema, body) => request(path, schema, jsonRequest.post(body)),
  put: (path, schema, body) => request(path, schema, jsonRequest.put(body)),
  patch: (path, schema, body) => request(path, schema, jsonRequest.patch(body)),
  delete: (path, schema, body) => request(path, schema, jsonRequest.delete(body)),
};

export { HttpError };
