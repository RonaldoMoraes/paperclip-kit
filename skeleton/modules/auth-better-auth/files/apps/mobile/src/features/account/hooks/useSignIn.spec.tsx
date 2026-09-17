import { renderScreen } from "@test/renderScreen";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pressable, Text } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEND_COOLDOWN_SECONDS } from "@contracts/auth/send-cooldown";
import { SIGNED_IN_SESSION } from "@contracts/mock-session";
import { useSignIn } from "./useSignIn";

const sendVerificationOtp = vi.fn();
const signInEmailOtp = vi.fn();
const signInSocial = vi.fn();
const getSession = vi.fn();
const refetchSession = vi.fn();
const replace = vi.fn();

vi.mock("~/lib/auth", () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: (...args: unknown[]) => sendVerificationOtp(...args) },
    signIn: {
      emailOtp: (...args: unknown[]) => signInEmailOtp(...args),
      social: (...args: unknown[]) => signInSocial(...args),
    },
    getSession: () => getSession(),
    useSession: () => ({ refetch: refetchSession }),
  },
}));

vi.mock("expo-router", () => ({ useRouter: () => ({ replace: (href: string) => replace(href) }) }));

function Harness() {
  const { step, error, nextCodeIn, sendOtp, verifyOtp, signInWithSocial, reset } = useSignIn();
  return (
    <>
      <Text testID="step">{step}</Text>
      <Text testID="error">{error ?? "-"}</Text>
      <Text testID="wait">{String(nextCodeIn)}</Text>
      <Pressable testID="send" onPress={() => sendOtp("someone@example.com")}>
        <Text>send</Text>
      </Pressable>
      <Pressable testID="verify" onPress={() => verifyOtp("someone@example.com", "12345")}>
        <Text>verify</Text>
      </Pressable>
      <Pressable testID="google" onPress={() => signInWithSocial("google")}>
        <Text>google</Text>
      </Pressable>
      <Pressable testID="reset" onPress={reset}>
        <Text>reset</Text>
      </Pressable>
    </>
  );
}

const press = (testID: string) => userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId(testID));
const step = () => screen.getByTestId("step");
const failure = () => screen.getByTestId("error");
const wait = () => screen.getByTestId("wait");

describe("useSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendVerificationOtp.mockResolvedValue({ error: null });
    signInEmailOtp.mockResolvedValue({ error: null });
    signInSocial.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: SIGNED_IN_SESSION });
    refetchSession.mockResolvedValue(undefined);
  });

  it("a sent code moves to the code step and starts the wait", async () => {
    renderScreen(<Harness />);

    await press("send");

    expect(sendVerificationOtp).toHaveBeenCalledWith({ email: "someone@example.com", type: "sign-in" });
    await waitFor(() => expect(step()).toHaveTextContent("code"));
    expect(wait()).toHaveTextContent(String(SEND_COOLDOWN_SECONDS));
  });

  // The rate limiter answers before the endpoint runs, with a status and no code — the one
  // refusal a person answers by waiting, so the wait starts and the step stays put.
  it("names a throttled send, starts the wait, and stays on the email step", async () => {
    sendVerificationOtp.mockResolvedValue({ error: { status: 429 } });
    renderScreen(<Harness />);

    await press("send");

    await waitFor(() => expect(failure()).toHaveTextContent(/Too many/));
    expect(step()).toHaveTextContent("method");
    expect(wait()).toHaveTextContent(String(SEND_COOLDOWN_SECONDS));
  });

  it("a send that failed for anything else costs nothing", async () => {
    sendVerificationOtp.mockRejectedValue(new Error("socket hang up"));
    renderScreen(<Harness />);

    await press("send");

    await waitFor(() => expect(failure()).toHaveTextContent("Something went wrong. Try again."));
    expect(wait()).toHaveTextContent("0");
  });

  // `Stack.Protected` opens the app group off `useSession()`, so the replace has to follow
  // the refetch: aimed a tick earlier it points at a screen not yet in the stack.
  it("refreshes the session before it moves the person off sign-in", async () => {
    const order: string[] = [];
    signInEmailOtp.mockImplementation(async () => {
      order.push("verify");
      return { error: null };
    });
    refetchSession.mockImplementation(async () => {
      order.push("session");
    });
    replace.mockImplementation(() => order.push("replace"));
    renderScreen(<Harness />);

    await press("verify");

    await waitFor(() => expect(order).toEqual(["verify", "session", "replace"]));
    expect(replace).toHaveBeenCalledWith("/");
  });

  // A wrong code is answered by typing the right one, so nothing holds a button shut over it.
  it("a rejected code keeps the person on the code step with the reason, and starts no wait", async () => {
    signInEmailOtp.mockResolvedValue({ error: { code: "INVALID_OTP" } });
    renderScreen(<Harness />);

    await press("send");
    await waitFor(() => expect(step()).toHaveTextContent("code"));
    // the send's own wait is the only one; it started at the send
    const afterSend = wait().textContent;
    await press("verify");

    await waitFor(() => expect(failure()).toHaveTextContent("That code doesn't match. Check it and try again."));
    expect(step()).toHaveTextContent("code");
    expect(replace).not.toHaveBeenCalled();
    expect(Number(wait().textContent)).toBeLessThanOrEqual(Number(afterSend));
  });

  // The whole reason the provider path reads the session at all: the Expo client resolves
  // without an error when the browser closes empty, so a dismissal and a refusal both look
  // like success from the call alone.
  it("treats a provider round-trip that ends without a session as the provider's failure", async () => {
    getSession.mockResolvedValue({ data: null });
    renderScreen(<Harness />);

    await press("google");

    await waitFor(() => expect(failure()).toHaveTextContent("Google sign-in failed. Please try again."));
    expect(replace).not.toHaveBeenCalled();
  });

  it("a provider that comes back with a session refreshes it and moves the person", async () => {
    renderScreen(<Harness />);

    await press("google");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(signInSocial).toHaveBeenCalledWith({ provider: "google", callbackURL: "/" });
    expect(refetchSession).toHaveBeenCalled();
  });

  it("reset puts the person back on the email step with nothing left over", async () => {
    signInEmailOtp.mockResolvedValue({ error: { code: "INVALID_OTP" } });
    renderScreen(<Harness />);

    await press("send");
    await waitFor(() => expect(step()).toHaveTextContent("code"));
    await press("verify");
    await waitFor(() => expect(failure()).toHaveTextContent(/doesn't match/));

    await press("reset");

    await waitFor(() => expect(step()).toHaveTextContent("method"));
    expect(failure()).toHaveTextContent("-");
  });
});
