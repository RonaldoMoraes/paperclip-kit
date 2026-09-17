import { QueryClient } from "@tanstack/react-query";

/**
 * The `queries` defaults — one retry, 30s of freshness, the stock `networkMode: "online"`
 * — are what a contract's `<name>Query(http)` factory gets unless it says otherwise; a
 * factory that owns its freshness sets `staleTime` and wins.
 *
 * Mutations cannot keep that default. `lib/reactQueryNative.ts` wires `onlineManager` to
 * the device, and under the stock mode an offline mutation is *paused*: `mutationFn` never
 * runs, `isPending` stays true and `onError` never fires — a button would sit on
 * "Saving…" forever with nothing said. `"always"` runs the mutation regardless; the call
 * fails, and the hook maps that failure to a line the user can act on.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { networkMode: "always" },
  },
});
