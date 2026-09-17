/**
 * The build's version, pinned by `vite.config.ts` from the root package.json. Absent
 * outside a Vite build (vitest, a bare import), so a spec sees `dev` and never a
 * half-substituted string.
 */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? "dev";
