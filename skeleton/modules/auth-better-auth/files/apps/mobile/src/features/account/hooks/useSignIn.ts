import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  type BetterAuthError,
  type SocialProvider,
  authFailureKind,
  authFailureMessage,
  otpFailure,
  socialFailure,
} from "@contracts/auth/errors";
import { waitFollowsSend } from "@contracts/auth/send-cooldown";
import { useSendCooldown } from "~/features/account/hooks/useSendCooldown";
import { authClient } from "~/lib/auth";

/**
 * Where a signed-in person lands, whichever door they came through: the index route, which
 * turns the resolved gates into a destination. Not a screen — this hook has no business
 * knowing which tab the app opens on.
 */
const LANDING = "/";

type SignIn = {
  step: "method" | "code";
  pending: boolean;
  error: string | null;
  /** Seconds before another code may be asked for; 0 leaves both send buttons open. */
  nextCodeIn: number;
  sendOtp: (email: string) => void;
  verifyOtp: (email: string, otp: string) => void;
  signInWithSocial: (provider: SocialProvider) => void;
  reset: () => void;
};

/**
 * The three doors into the app: a provider, and the two-step email code. The code step is
 * state, not a route, so "use a different email" is a state change and not a back-stack
 * manoeuvre; a verified code replaces the route so "back" cannot return to a form already
 * completed.
 *
 * Better Auth flips `useSession()` on its own, a tick later. `Stack.Protected` opens the
 * app group off that session, so the flip has to land first — otherwise the replace aims
 * at a screen that is not in the stack yet. The refetch is awaited for that reason, on
 * every door.
 *
 * The wait between codes is this hook's: it starts where the send settles, so a failed
 * verify — which moves the same error — can never be read as a send's outcome.
 */
export function useSignIn(): SignIn {
  const router = useRouter();
  const { refetch: refetchSession } = authClient.useSession();
  const [step, setStep] = useState<"method" | "code">("method");
  const [error, setError] = useState<string | null>(null);
  const cooldown = useSendCooldown();

  const { mutate: send, isPending: sending } = useMutation({
    mutationFn: async (email: string) => {
      const { error: failure } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (failure) throw otpFailure(failure);
    },
    onMutate: () => setError(null),
    onSuccess: () => setStep("code"),
    onError: (failure) => setError(authFailureMessage(failure)),
    onSettled: (_result, failure) => {
      if (waitFollowsSend(failure ? authFailureKind(failure) : null)) cooldown.start();
    },
  });

  const { mutate: verify, isPending: verifying } = useMutation({
    mutationFn: async ({ email, otp }: { email: string; otp: string }) => {
      const { error: failure } = await authClient.signIn.emailOtp({ email, otp });
      if (failure) throw otpFailure(failure);
      await refetchSession();
      router.replace(LANDING);
    },
    onMutate: () => setError(null),
    onError: (failure) => setError(authFailureMessage(failure)),
  });

  // The Expo client hands the provider round-trip to the system browser and deep-links
  // back on the app scheme. It resolves without an error whenever the browser closes
  // without a session cookie — a dismissal and a refused sign-in look the same from here
  // — so the session decides the outcome, not the returned error.
  const { mutate: social, isPending: connecting } = useMutation({
    mutationFn: async (provider: SocialProvider) => {
      let failure: BetterAuthError | null | undefined;
      try {
        ({ error: failure } = await authClient.signIn.social({ provider, callbackURL: LANDING }));
      } catch {
        throw socialFailure(provider, null);
      }
      if (failure) throw socialFailure(provider, failure);
      const { data: session } = await authClient.getSession();
      if (!session) throw socialFailure(provider, null);
      // `useSession()` is what the gate reads, and it does not follow `getSession()`.
      await refetchSession();
      router.replace(LANDING);
    },
    onMutate: () => setError(null),
    onError: (failure) => setError(authFailureMessage(failure)),
  });

  return {
    step,
    pending: sending || verifying || connecting,
    error,
    nextCodeIn: cooldown.remaining,
    sendOtp: (email) => send(email),
    verifyOtp: (email, otp) => verify({ email, otp }),
    signInWithSocial: (provider) => social(provider),
    reset: () => {
      setError(null);
      setStep("method");
    },
  };
}
