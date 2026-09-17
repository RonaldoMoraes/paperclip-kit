import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

/**
 * Render a screen or a route with the providers the app mounts above it.
 *
 * One client per call, never the app's own: a shared client carries a mutation's state
 * from one test into the next, and a spec that passes alone then fails in the file. The
 * client is built here rather than inside the wrapper component, which React re-renders —
 * a client rebuilt on `rerender` would drop the very state the rerender is testing.
 *
 * Retries are off so a failing call fails once: a retried mutation turns a one-line
 * assertion into a timeout. `networkMode: "always"` matches `src/lib/queryClient.ts` —
 * the app's mutations run regardless of the connection so a failure reaches the man as a
 * message, and a spec that paused instead would prove the opposite of what ships.
 *
 * A hook that touches no provider renders through bare `render`/`renderHook` and says so
 * in the file, rather than standing up a client it never reads.
 */
export function renderScreen(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false, networkMode: "always" },
    },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <SafeAreaProvider>{children}</SafeAreaProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Providers });
}
