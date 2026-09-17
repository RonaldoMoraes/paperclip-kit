import { z } from "zod";
import type { Http } from "../http";

/**
 * `GET /api/health` — is the server up, and which build is it.
 *
 * Read by a load balancer's probe, the e2e suite's readiness wait and the settings
 * screen's version line. Public, cheap, and never touches storage: a probe that needs
 * the database reports the database, not the server.
 */
export const GetHealthResponse = z.object({
  ok: z.literal(true),
  version: z.string().min(1),
});
export type GetHealthResponse = z.infer<typeof GetHealthResponse>;

export function getHealth(http: Http): Promise<GetHealthResponse> {
  return http.get("/api/health", GetHealthResponse);
}

export function getHealthQuery(http: Http) {
  return {
    queryKey: ["health"] as const,
    // The build does not change under a running client; one read per session is enough.
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => getHealth(http),
  };
}
