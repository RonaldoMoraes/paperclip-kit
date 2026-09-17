import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignIn } from "./SignIn";

const user = () => userEvent.setup({ pointerEventsCheck: 0 });

type Props = Parameters<typeof SignIn>[0];

/** Rerenders carry forward, as the props a mounted screen receives over time do. */
const renderSignIn = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    step: "method",
    pending: false,
    error: null,
    nextCodeIn: 0,
    providers: ["apple", "google"],
    onSocial: vi.fn(),
    onSendOtp: vi.fn(),
    onVerifyOtp: vi.fn(),
    onChangeEmail: vi.fn(),
    ...overrides,
  };
  let current = props;
  const { rerender } = render(<SignIn {...current} />);
  return {
    props,
    rerender: (next: Partial<Props>) => {
      current = { ...current, ...next };
      rerender(<SignIn {...current} />);
    },
  };
};

describe("SignIn", () => {
  it("offers exactly the providers it is given, and names the one handed to the flow", async () => {
    const { props } = renderSignIn({ providers: ["google"] });

    expect(screen.queryByTestId("account-apple")).toBeNull();
    await user().click(screen.getByTestId("account-google"));

    expect(props.onSocial).toHaveBeenLastCalledWith("google");
  });

  // One provider round-trip at a time: a second tap while the first is in the browser
  // would start a sign-in nobody can see the result of.
  it("closes every door while a sign-in is in flight", async () => {
    const { props } = renderSignIn({ pending: true });

    await user().click(screen.getByTestId("account-apple"));
    await user().click(screen.getByTestId("account-email-submit"));

    expect(props.onSocial).not.toHaveBeenCalled();
    expect(props.onSendOtp).not.toHaveBeenCalled();
  });

  it("drops the email complaint when a provider is chosen instead", async () => {
    const { props } = renderSignIn();

    await user().click(screen.getByTestId("account-email-submit"));
    expect(screen.getByTestId("account-error")).toHaveTextContent("Enter your email first.");

    await user().click(screen.getByTestId("account-google"));

    expect(props.onSocial).toHaveBeenCalledWith("google");
    expect(screen.queryByTestId("account-error")).toBeNull();
  });

  it("refuses an empty field and a non-address before anything reaches the flow", async () => {
    const { props } = renderSignIn();

    await user().click(screen.getByTestId("account-email-submit"));
    expect(screen.getByTestId("account-error")).toHaveTextContent("Enter your email first.");

    await user().type(screen.getByTestId("account-email-input"), "someone");
    await user().click(screen.getByTestId("account-email-submit"));
    expect(screen.getByTestId("account-error")).toHaveTextContent("That doesn't look like an email address.");

    expect(props.onSendOtp).not.toHaveBeenCalled();
  });

  it("hands the trimmed email to the flow", async () => {
    const { props } = renderSignIn();

    await user().type(screen.getByTestId("account-email-input"), "  someone@example.com  ");
    await user().click(screen.getByTestId("account-email-submit"));

    expect(props.onSendOtp).toHaveBeenCalledWith("someone@example.com");
  });

  it("keeps non-digits out of the code, refuses a short one, and hands a whole one on with the email", async () => {
    const { props, rerender } = renderSignIn();
    await user().type(screen.getByTestId("account-email-input"), "someone@example.com");
    await user().click(screen.getByTestId("account-email-submit"));
    rerender({ step: "code" });

    expect(screen.getByTestId("account-sent-to")).toHaveTextContent("someone@example.com");
    await user().type(screen.getByTestId("account-otp-input"), "12a");
    await user().click(screen.getByTestId("account-otp-submit"));
    expect(screen.getByTestId("account-otp-input")).toHaveValue("12");
    expect(screen.getByTestId("account-error")).toHaveTextContent("Enter the full code from the email.");
    expect(props.onVerifyOtp).not.toHaveBeenCalled();

    await user().type(screen.getByTestId("account-otp-input"), "345");
    await user().click(screen.getByTestId("account-otp-submit"));
    expect(props.onVerifyOtp).toHaveBeenCalledWith("someone@example.com", "12345");
  });

  it("shows the flow's error without leaving the code step", () => {
    renderSignIn({ step: "code", error: "That code doesn't match. Check it and try again." });

    expect(screen.getByTestId("account-error")).toHaveTextContent("That code doesn't match");
    expect(screen.getByTestId("account-otp-input")).toBeInTheDocument();
  });

  it("goes back to the email step without carrying the error along", async () => {
    const { props, rerender } = renderSignIn({ step: "code" });

    await user().click(screen.getByTestId("account-otp-submit"));
    expect(screen.getByTestId("account-error")).toBeInTheDocument();

    await user().click(screen.getByTestId("account-change-email"));
    expect(props.onChangeEmail).toHaveBeenCalled();

    rerender({ step: "method" });
    expect(screen.getByTestId("account-email-input")).toBeInTheDocument();
    expect(screen.queryByTestId("account-error")).toBeNull();
  });
});

/**
 * The wait itself is `useSendCooldown`'s; what the screen owes is showing it — both send
 * buttons closed and counting, wherever the person is standing when it runs.
 */
describe("SignIn, while another code is still on its wait", () => {
  const waiting = 12;

  it("counts the wait down on the resend and refuses the tap", async () => {
    const { props } = renderSignIn({ step: "code", nextCodeIn: waiting });

    expect(screen.getByTestId("account-resend")).toHaveTextContent(`Send a new code in ${waiting}s`);
    await user().click(screen.getByTestId("account-resend"));

    expect(props.onSendOtp).not.toHaveBeenCalled();
  });

  it("counts the same wait down on the email step and refuses the tap", async () => {
    const { props } = renderSignIn({ step: "method", nextCodeIn: waiting });

    await user().type(screen.getByTestId("account-email-input"), "someone@example.com");
    expect(screen.getByTestId("account-email-submit")).toHaveTextContent(`Continue with email in ${waiting}s`);
    await user().click(screen.getByTestId("account-email-submit"));

    expect(props.onSendOtp).not.toHaveBeenCalled();
  });

  it("leaves the providers open, and gives both buttons their own labels back when the wait is over", async () => {
    const { props, rerender } = renderSignIn({ step: "code", nextCodeIn: waiting });

    rerender({ nextCodeIn: 0 });
    expect(screen.getByTestId("account-resend")).toHaveTextContent(/^Send a new code$/);

    rerender({ step: "method" });
    await user().click(screen.getByTestId("account-google"));
    expect(props.onSocial).toHaveBeenCalledWith("google");
    expect(screen.getByTestId("account-email-submit")).toHaveTextContent(/^Continue with email$/);
  });
});
