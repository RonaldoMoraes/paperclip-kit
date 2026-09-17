import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { COOKIE_PREFIX } from "@contracts/auth/cookies";
import { API_URL, APP_SCHEME } from "./config";

/**
 * The auth client — the one thing on this app that talks to `/api/auth` and the one
 * thing that holds the session. `expoClient` swaps the browser's cookie jar for
 * SecureStore, so a session survives a relaunch, and hands the cookie back through
 * `getCookie()` for the transport (`bootSession` in `./session.ts`). It stores only
 * `Set-Cookie` headers named with `cookiePrefix`, which is why that is the server's
 * prefix (`@contracts/auth/cookies`) and not `APP_SCHEME`.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({ scheme: APP_SCHEME, storagePrefix: APP_SCHEME, storage: SecureStore, cookiePrefix: COOKIE_PREFIX }),
    emailOTPClient(),
  ],
});
