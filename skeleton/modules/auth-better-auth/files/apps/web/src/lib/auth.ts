import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { type AuthFlowError, type SocialProvider, socialFailure } from "@contracts/auth/errors";

/**
 * The auth client — the one thing on this app that talks to `/api/auth` and the one
 * thing that touches the session cookie (`client-storage.grit` keeps everything else
 * away from `document.cookie`). Same origin, so no `baseURL`: Vite proxies `/api` in dev
 * and the server serves the bundle in production.
 */
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

/**
 * Social sign-in. Redirects the whole page to the provider; on return, Better Auth lands
 * on `callbackURL` with the session cookie set, or on `errorCallbackURL?error=…` when the
 * round-trip failed. Without `errorCallbackURL` a failed provider callback dead-ends on
 * Better Auth's own error page.
 *
 * Answers with the refusal rather than its copy: the caller shows the message and reports
 * the reason, and a returned error at all means the page never left.
 */
export async function signInWithSocial(
  provider: SocialProvider,
  callbackURL: string,
  errorCallbackURL: string
): Promise<AuthFlowError | null> {
  try {
    const result = await authClient.signIn.social({ provider, callbackURL, errorCallbackURL });
    if (result?.error) return socialFailure(provider, result.error);
    return null;
  } catch {
    return socialFailure(provider, null);
  }
}
