import { QueryClient } from "@tanstack/react-query";

/**
 * One retry keeps a flaky network from looking like a refusal; 30s of freshness stops a
 * screen change from refetching what it just rendered. Keys are `[feature, …]` so a
 * feature invalidates as one; each contract query states its own `staleTime` with a reason.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
