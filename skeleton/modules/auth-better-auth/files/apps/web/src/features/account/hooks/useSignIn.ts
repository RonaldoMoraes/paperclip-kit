import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { type SocialProvider, authFailureKind, authFailureMessage, otpFailure } from "@contracts/auth/errors";
import { waitFollowsSend } from "@contracts/auth/send-cooldown";
import { ACCOUNT_COPY } from "@domain/account/copy";
import { useSendCooldown } from "~/features/account/hooks/useSendCooldown";
import { authClient, signInWithSocial } from "~/lib/auth";
import { refreshSession } from "~/lib/session";

type Options = {
  /** where the gate turned the person away from — where a sign-in finishes the trip */
  destination?: string;
  /** the route landed with `?error=`: a provider sent them back without a session */
  socialFailed?: boolean;
};

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

/** Where a failed provider round-trip lands: this screen, with the way back preserved. */
export function socialErrorURL(destination: string | undefined): string {
  const params = new URLSearchParams({ error: "1" });
  if (destination) params.set("redirect", destination);
  return `/account?${params.toString()}`;
}

/**
 * The three doors into the app: a provider, and the two-step email code. A provider takes
 * the whole page to the provider and lands it, signed in, on the destination itself —
 * the gate there reads the session the callback set. The email door stays on this screen:
 * the code step is state, not a route, so "use a different email" is a state change and
 * not a back-stack manoeuvre, and a verified code refreshes the session query before it
 * navigates, so the gate on the destination reads the session the person now has.
 *
 * The wait between codes is this hook's: it starts where the send settles, so a failed
 * verify — which moves the same error — can never be read as a send's outcome.
 */
export function useSignIn({ destination, socialFailed = false }: Options = {}): SignIn {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"method" | "code">("method");
  const [error, setError] = useState<string | null>(socialFailed ? ACCOUNT_COPY.socialFailed : null);
  const cooldown = useSendCooldown();

  const landing = destination ?? "/";

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
      await refreshSession(queryClient);
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      navigate({ href: landing, replace: true });
    },
    onError: (failure) => setError(authFailureMessage(failure)),
  });

  const { mutate: social, isPending: redirecting } = useMutation({
    mutationFn: (provider: SocialProvider) => signInWithSocial(provider, landing, socialErrorURL(destination)),
    onMutate: () => setError(null),
    // On success the page has already left for the provider; a refusal handed back means
    // it didn't. `signInWithSocial` answers with that refusal instead of throwing, so
    // there is no error path here for it to arrive by.
    onSuccess: (failure) => {
      if (failure) setError(failure.message);
    },
  });

  return {
    step,
    pending: sending || verifying || redirecting,
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
