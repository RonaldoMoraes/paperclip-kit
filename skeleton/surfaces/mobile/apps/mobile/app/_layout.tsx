import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { type ReactNode, useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { markLaunchDone } from "~/data/launch";
import { useAppGates } from "~/features/shell/hooks/useAppGates";
import { KIT_BOOT, KIT_PROVIDERS } from "~/kit.gen";
import { queryClient } from "~/lib/queryClient";
import { installNativeRuntimeSignals } from "~/lib/reactQueryNative";
import "../global.css";

// At module scope so it runs before the first frame: the native splash stays up until
// every gate has resolved, and the user sees one splash instead of the OS's followed by a
// blank frame. It rejects when the splash is already gone, which is not a reason to take
// the app down.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

// One face, one file per cut — native has no synthetic bold and no fallback stack, so every
// weight the app sets is registered here under the name `tailwind.config.js` gives it.
const FONTS = { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold };

/**
 * Every module's boot step, once, before anything mounts (`KIT_BOOT` in `kit.gen.tsx`).
 * Held at module scope so a remount of the layout never runs them twice; a step that
 * fails is logged and the app opens anyway — a boot step is a module's nicety, the app
 * opening is not.
 */
async function runBoot(): Promise<void> {
  try {
    await Promise.all(KIT_BOOT.map((boot) => boot()));
  } catch (error) {
    console.warn("[app] a boot step failed:", error);
  }
}
const booted = runBoot();

function useBooted(): boolean {
  const [done, setDone] = useState(KIT_BOOT.length === 0);

  useEffect(() => {
    let live = true;
    (async () => {
      await booted;
      if (live) setDone(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  return done;
}

/** The modules' providers, outermost first, under the query client so any of them may read a query. */
function KitProviders({ children }: { children: ReactNode }) {
  return KIT_PROVIDERS.reduceRight<ReactNode>((inner, Provider) => <Provider>{inner}</Provider>, children);
}

/**
 * `Stack.Protected` is the guard: a screen whose guard turns false is removed from the
 * stack along with its history, so a group closed by a module's gate cannot be reached by
 * going back. `index` stays unguarded — it is where the resolved gates decide where the
 * user goes — and `+not-found` beside it, because a URL the map does not have can arrive
 * in either state and hands itself to `index` either way.
 *
 * The gates are hooks (`KIT_GATES`), so the stack is a child of the providers rather than
 * the layout itself: a gate that reads a query cannot be asked above the client that
 * answers it. Base ships no gate — the app group is open. The auth module adds the first
 * one, with the `sign-in` route it redirects to.
 */
function RootStack() {
  const { ready, allow } = useAppGates();

  useEffect(() => {
    // Nothing under `index` renders while a gate is pending — the splash comes down when
    // all of them have answered.
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => undefined);
    markLaunchDone("splash-hidden");
  }, [ready]);

  return (
    // No status bar here: each route group derives its own from `useColorScheme()`,
    // beside the screens whose ground it has to stay legible against.
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="+not-found" />
      <Stack.Protected guard={allow}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONTS);
  // A face that failed to load is a worse screen, not a broken one: the app opens in the
  // system face rather than holding the splash over an error it cannot recover from.
  const fontsResolved = fontsLoaded || Boolean(fontError);
  const booted = useBooted();

  // Caught and logged, never rethrown: this effect runs once, before anything has
  // resolved, so a throw here would unmount the tree before `RootStack` ever gets its turn
  // to hide the splash — leaving the native splash up over a dead app with no way out.
  useEffect(() => {
    try {
      return installNativeRuntimeSignals();
    } catch (error) {
      console.warn("[app] could not wire the React Query runtime signals:", error);
      return undefined;
    }
  }, []);

  // Nothing mounts before the faces are registered: Android measures a Text once, with
  // whatever face is available at layout, and a label measured in the system face is
  // laid out short when the real face arrives — it then ellipsizes text that fits.
  if (!fontsResolved || !booted) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <KitProviders>
          <RootStack />
        </KitProviders>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
