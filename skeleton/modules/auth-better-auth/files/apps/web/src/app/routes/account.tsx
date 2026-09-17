import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { SOCIAL_PROVIDERS } from "@contracts/auth/errors";
import { useSignIn } from "~/features/account/hooks/useSignIn";
import { Account } from "~/features/account/screens/Account";
import { readSession } from "~/lib/session";

/**
 * `redirect` is where the session gate turned the person away from, so it is only ever a
 * path inside this app. What follows the leading slash decides that: a second `/` or a
 * `\` makes it a host — `//evil.com` and `/\evil.com` both resolve to another origin.
 */
const appPath = z.string().refine((value) => /^\/(?![/\\])/.test(value));

/**
 * Every field catches its own failure. A hand-typed or truncated query string is not a
 * reason to show an error screen — it is a reason to ignore the parameter.
 */
export const AccountSearch = z.object({
  redirect: appPath.optional().catch(undefined),
  /** Better Auth appends `?error=…` to `errorCallbackURL` when a provider round-trip fails. */
  error: z.string().optional().catch(undefined),
});

/**
 * Sign-in: beside `_app`, not under it — no shell, no gate. A person who already has a
 * session has nothing to do here and goes on to wherever the gate turned them away from,
 * or to the root, which opens on the first destination.
 */
export const Route = createFileRoute("/account")({
  validateSearch: (search: Record<string, unknown>) => AccountSearch.parse(search),
  beforeLoad: async ({ context, search }) => {
    const session = await readSession(context.queryClient);
    if (session) throw redirect({ href: search.redirect ?? "/", replace: true });
  },
  component: AccountRoute,
});

function AccountRoute() {
  const { redirect: destination, error } = Route.useSearch();
  const flow = useSignIn({ destination, socialFailed: Boolean(error) });
  return (
    <Account
      step={flow.step}
      pending={flow.pending}
      error={flow.error}
      nextCodeIn={flow.nextCodeIn}
      // every provider the server knows; a product without one drops it from this list
      providers={SOCIAL_PROVIDERS}
      onSendOtp={flow.sendOtp}
      onVerifyOtp={flow.verifyOtp}
      onSocial={flow.signInWithSocial}
      onChangeEmail={flow.reset}
    />
  );
}
