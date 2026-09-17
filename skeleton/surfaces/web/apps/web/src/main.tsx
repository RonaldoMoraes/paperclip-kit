import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "~/app/App";
import { KIT_BOOT } from "~/app/kit.gen";
import "@ui/base.css";

/**
 * Rendering waits for the mock worker: a screen that fetches on mount would otherwise race
 * its registration and see a real 404. Then every module's boot runs, in order, before the
 * first render — an SDK that must initialise before a screen mounts lives there.
 */
async function start(): Promise<void> {
  if (import.meta.env.VITE_API_MODE === "mock") {
    const { startMocks } = await import("~/app/mocks");
    await startMocks();
  }

  for (const boot of KIT_BOOT) await boot();

  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

start();
