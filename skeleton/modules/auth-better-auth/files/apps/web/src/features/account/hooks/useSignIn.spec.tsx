import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { socialFailure } from "@contracts/auth/errors";
import { SEND_COOLDOWN_SECONDS } from "@contracts/auth/send-cooldown";
import { SIGNED_IN_SESSION } from "@contracts/mock-session";
import { socialErrorURL, useSignIn } from "~/features/account/hooks/useSignIn";
import { renderAt, routeTestId } from "~/testing/renderScreen";

const sendVerificationOtp = vi.fn();
const signInEmailOtp = vi.fn();
const getSession = vi.fn();
const signInSocial = vi.fn();

vi.mock("~/lib/auth", () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: (...args: unknown[]) => sendVerificationOtp(...args) },
    signIn: { emailOtp: (...args: unknown[]) => signInEmailOtp(...args) },
    getSession: () => getSession(),
  },
  signInWithSocial: (...args: unknown[]) => signInSocial(...args),
}));

function Harness({ destination, socialFailed }: { destination?: string; socialFailed?: boolean }) {
  const { step, error, nextCodeIn, sendOtp, verifyOtp, signInWithSocial, reset } = useSignIn({
    destination,
    socialFailed,
  });
  return (
    <div>
      <p data-testid="sign-in-step">{`step:${step}`}</p>
      <p data-testid="sign-in-error">{`error:${error ?? "-"}`}</p>
      <p data-testid="sign-in-wait">{`wait:${nextCodeIn}`}</p>
      <button type="button" data-testid="sign-in-send" onClick={() => sendOtp("someone@example.com")}>
        send
      </button>
      <button type="button" data-testid="sign-in-verify" onClick={() => verifyOtp("someone@example.com", "12345")}>
        verify
      </button>
      <button type="button" data-testid="sign-in-google" onClick={() => signInWithSocial("google")}>
        google
      </button>
      <button type="button" data-testid="sign-in-reset" onClick={reset}>
        reset
      </button>
    </div>
  );
}

/** the harness prints the step and the error in place, so both are waited on rather than found */
const expectStep = (step: string) =>
  waitFor(() => expect(screen.getByTestId("sign-in-step")).toHaveTextContent(`step:${step}`));
const expectError = (message: string | RegExp) =>
  waitFor(() => expect(screen.getByTestId("sign-in-error")).toHaveTextContent(message));
const expectWait = (seconds: number) =>
  waitFor(() => expect(screen.getByTestId("sign-in-wait")).toHaveTextContent(`wait:${seconds}`));

describe("useSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendVerificationOtp.mockResolvedValue({ error: null });
    signInEmailOtp.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: SIGNED_IN_SESSION, error: null });
    signInSocial.mockResolvedValue(null);
  });

  it("a sent code moves to the code step", async () => {
    await renderAt("/account", <Harness />);
    await userEvent.click(screen.getByTestId("sign-in-send"));

    expect(sendVerificationOtp).toHaveBeenCalledWith({ email: "someone@example.com", type: "sign-in" });
    await expectStep("code");
  });

  // The other half of the gate's redirect: they were reaching for /settings, so signing in
  // finishes that trip rather than dropping them on the root.
  it("a verified code finishes the trip the gate interrupted", async () => {
    await renderAt("/account?redirect=%2Fsettings", <Harness destination="/settings" />);
    await userEvent.click(screen.getByTestId("sign-in-verify"));

    expect(signInEmailOtp).toHaveBeenCalledWith({ email: "someone@example.com", otp: "12345" });
    expect(await screen.findByTestId(routeTestId("/settings"))).toBeInTheDocument();
  });

  it("someone who came here on their own lands on the root", async () => {
    await renderAt("/account", <Harness />);
    await userEvent.click(screen.getByTestId("sign-in-verify"));

    expect(await screen.findByTestId(routeTestId("/"))).toBeInTheDocument();
  });

  // The route they land on is gated on the session query, and Better Auth has just flipped
  // the cookie underneath it. Asking again before leaving is what makes the gate read the
  // session they now have rather than the one they arrived with.
  it("refreshes the session before leaving the sign-in screen", async () => {
    const order: string[] = [];
    signInEmailOtp.mockImplementation(async () => {
      order.push("verify");
      return { error: null };
    });
    getSession.mockImplementation(async () => {
      order.push("session");
      return { data: SIGNED_IN_SESSION, error: null };
    });
    await renderAt("/account", <Harness />);

    await userEvent.click(screen.getByTestId("sign-in-verify"));
    await screen.findByTestId(routeTestId("/"));

    expect(order).toEqual(["verify", "session"]);
  });

  it("surfaces a mapped refusal and keeps a stranger failure generic", async () => {
    signInEmailOtp.mockResolvedValueOnce({ error: { code: "INVALID_OTP" } });
    await renderAt("/account", <Harness />);
    await userEvent.click(screen.getByTestId("sign-in-verify"));
    await expectError(/That code doesn't match/);

    signInEmailOtp.mockRejectedValueOnce(new Error("socket hang up"));
    await userEvent.click(screen.getByTestId("sign-in-verify"));
    await expectError("Something went wrong. Try again.");
  });

  describe("the wait between codes", () => {
    it("a sent code starts the wait", async () => {
      await renderAt("/account", <Harness />);
      await userEvent.click(screen.getByTestId("sign-in-send"));

      await expectWait(SEND_COOLDOWN_SECONDS);
    });

    // The server's own refusal for coming too fast is the one a person answers by waiting.
    it("a send the server refused as too fast starts the wait and names it", async () => {
      sendVerificationOtp.mockResolvedValueOnce({ error: { status: 429 } });
      await renderAt("/account", <Harness />);
      await userEvent.click(screen.getByTestId("sign-in-send"));

      await expectError(/Too many/);
      await expectWait(SEND_COOLDOWN_SECONDS);
      await expectStep("method");
    });

    it("a send that failed for anything else costs nothing", async () => {
      sendVerificationOtp.mockRejectedValueOnce(new Error("socket hang up"));
      await renderAt("/account", <Harness />);
      await userEvent.click(screen.getByTestId("sign-in-send"));

      await expectError("Something went wrong. Try again.");
      await expectWait(0);
    });

    // A mistyped code is answered by typing the right one; a wait on it would lock the
    // code they are waiting for behind a countdown they did not earn.
    it("a rejected code starts no wait", async () => {
      signInEmailOtp.mockResolvedValueOnce({ error: { code: "INVALID_OTP" } });
      await renderAt("/account", <Harness />);
      await userEvent.click(screen.getByTestId("sign-in-verify"));

      await expectError(/That code doesn't match/);
      await expectWait(0);
    });
  });

  it("sends a provider to the destination, with the way back on the error leg", async () => {
    await renderAt("/account?redirect=%2Fsettings", <Harness destination="/settings" />);
    await userEvent.click(screen.getByTestId("sign-in-google"));

    await waitFor(() =>
      expect(signInSocial).toHaveBeenCalledWith("google", "/settings", "/account?error=1&redirect=%2Fsettings")
    );
    expect(socialErrorURL(undefined)).toBe("/account?error=1");
  });

  // The page never left, so what came back is all there is: the provider's own line.
  it("says which provider refused, from the failure it hands back", async () => {
    signInSocial.mockResolvedValue(socialFailure("google", null));
    await renderAt("/account", <Harness />);
    await userEvent.click(screen.getByTestId("sign-in-google"));

    await expectError("Google sign-in failed. Please try again.");
  });

  it("a failed provider round-trip arrives as an error on the screen", async () => {
    await renderAt("/account?error=access_denied", <Harness socialFailed />);
    expect(screen.getByTestId("sign-in-error")).toHaveTextContent("Sign-in didn't complete. Try again, or use email.");
  });

  it("reset puts the person back on the email step with nothing left over", async () => {
    signInEmailOtp.mockResolvedValueOnce({ error: { code: "INVALID_OTP" } });
    await renderAt("/account", <Harness />);
    await userEvent.click(screen.getByTestId("sign-in-send"));
    await expectStep("code");
    await userEvent.click(screen.getByTestId("sign-in-verify"));
    await expectError(/That code doesn't match/);

    await userEvent.click(screen.getByTestId("sign-in-reset"));

    await expectStep("method");
    await expectError("error:-");
  });
});
