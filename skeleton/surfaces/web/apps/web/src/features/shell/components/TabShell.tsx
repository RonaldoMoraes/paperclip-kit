import type { ReactNode } from "react";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";

/**
 * The app's chrome: the top bar and the floating tab bar around the destinations.
 * `Screen` stays per-screen — this wraps whatever the `_app` layout route mounts, and
 * nothing else; a full-viewport screen outside that layout never sees it.
 */
export function TabShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar />
      {children}
      <TabBar />
    </>
  );
}
