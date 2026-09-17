import type { ZodType } from "zod";
import type { Http, JsonRequest } from "@contracts/http";
import { HttpError, httpErrorFrom, jsonRequest } from "@contracts/http";

/**
 * The web app's `Http`, and its one way to reach `/api`.
 *
 * Same origin in every environment (Vite proxies to the server in dev, the server serves
 * the bundle in production), so paths stay relative. `credentials: "include"` because a
 * session, when a module adds one, is a cookie; and every response is parsed by its
 * `shared/contracts` schema — a server that drifts from the contract fails here, not three
 * components later.
 *
 * A failure is read the same way on both platforms — `httpErrorFrom` is that decision, and
 * `jsonRequest` is the one place a body is serialised.
 */
async function request<T>(path: string, schema: ZodType<T>, init: JsonRequest): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...init.headers },
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

/**
 * The same transport with `keepalive: true` — a request the browser delivers even after
 * its page is gone, for a fire-and-forget call whose answer nobody is left to read (an
 * analytics flush on page-hide; a plain fetch would be aborted by the navigation).
 * Everything else uses `http`: keepalive caps the body at 64KiB.
 */
export const keepaliveHttp: Http = {
  get: (path, schema) => request(path, schema, { ...jsonRequest.get(), keepalive: true }),
  post: (path, schema, body) => request(path, schema, { ...jsonRequest.post(body), keepalive: true }),
  put: (path, schema, body) => request(path, schema, { ...jsonRequest.put(body), keepalive: true }),
  patch: (path, schema, body) => request(path, schema, { ...jsonRequest.patch(body), keepalive: true }),
  delete: (path, schema, body) => request(path, schema, { ...jsonRequest.delete(body), keepalive: true }),
};

export { HttpError };
