import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderAt } from "~/testing/renderScreen";
import { Account } from "./Account";

type Props = Parameters<typeof Account>[0];

/**
 * The flow, as far as the screen can see it: a send moves the step to the code, "use a
 * different email" moves it back. The screen keeps the address across that move, which
 * is what a verify and a resend both hand back — the claim the stateful cases make.
 */
function Flow(props: Props) {
  const [step, setStep] = useState(props.step);
  return (
    <Account
      {...props}
      step={step}
      onSendOtp={(email) => {
        props.onSendOtp(email);
        setStep("code");
      }}
      onChangeEmail={() => {
        props.onChangeEmail();
        setStep("method");
      }}
    />
  );
}

async function renderAccount(overrides: Partial<Props> = {}) {
  const props: Props = {
    step: "method",
    pending: false,
    error: null,
    nextCodeIn: 0,
    providers: ["apple", "google"],
    onSendOtp: vi.fn(),
    onVerifyOtp: vi.fn(),
    onSocial: vi.fn(),
    onChangeEmail: vi.fn(),
    ...overrides,
  };
  await renderAt("/account", <Flow {...props} />);
  return { props };
}

describe("Account", () => {
  it("offers exactly the providers it is given, and hands the chosen one to the flow", async () => {
    const { props } = await renderAccount({ providers: ["google"] });

    expect(screen.queryByTestId("account-apple")).toBeNull();
    await userEvent.click(screen.getByTestId("account-google"));

    expect(props.onSocial).toHaveBeenCalledWith("google");
  });

  // The email field's complaint belongs to a door just walked away from; a provider takes
  // the whole page, and that line must not be what the person comes back to.
  it("drops the email complaint when a provider is chosen instead", async () => {
    const { props } = await renderAccount();

    await userEvent.click(screen.getByTestId("account-email-submit"));
    expect(await screen.findByTestId("account-error")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("account-google"));

    expect(props.onSocial).toHaveBeenCalledWith("google");
    expect(screen.queryByTestId("account-error")).toBeNull();
  });

  it("hands the trimmed address to the flow", async () => {
    const { props } = await renderAccount();
    await userEvent.type(screen.getByTestId("account-email-input"), "  someone@example.com  ");
    await userEvent.click(screen.getByTestId("account-email-submit"));

    expect(props.onSendOtp).toHaveBeenCalledWith("someone@example.com");
  });

  // The shared schema, not the browser's own bubble on `type="email"` — the field is
  // `noValidate` so both apps answer the same typo with the same sentence.
  it("refuses an empty field and a non-address before anything reaches the flow", async () => {
    const { props } = await renderAccount();

    await userEvent.click(screen.getByTestId("account-email-submit"));
    expect(await screen.findByTestId("account-error")).toHaveTextContent("Enter your email first.");

    await userEvent.type(screen.getByTestId("account-email-input"), "someone");
    await userEvent.click(screen.getByTestId("account-email-submit"));
    expect(await screen.findByTestId("account-error")).toHaveTextContent("That doesn't look like an email address.");

    expect(props.onSendOtp).not.toHaveBeenCalled();
  });

  it("on the code step names the address the code went to and hands email and code to the flow", async () => {
    const { props } = await renderAccount();
    await userEvent.type(screen.getByTestId("account-email-input"), "someone@example.com");
    await userEvent.click(screen.getByTestId("account-email-submit"));

    expect(await screen.findByTestId("account-sent-to")).toHaveTextContent("someone@example.com");
    await userEvent.type(screen.getByTestId("account-otp-input"), "12a345");
    await userEvent.click(screen.getByTestId("account-otp-submit"));

    // non-digits never enter the field, and the length cap holds
    expect(props.onVerifyOtp).toHaveBeenCalledWith("someone@example.com", "12345");
  });

  it("refuses a short code before it reaches the flow", async () => {
    const { props } = await renderAccount({ step: "code" });
    await userEvent.type(screen.getByTestId("account-otp-input"), "12");
    await userEvent.click(screen.getByTestId("account-otp-submit"));

    expect(await screen.findByTestId("account-error")).toHaveTextContent("Enter the full code from the email.");
    expect(props.onVerifyOtp).not.toHaveBeenCalled();
  });

  it("asks for a new code at the address already given, and goes back to the email step on request", async () => {
    const { props } = await renderAccount();
    await userEvent.type(screen.getByTestId("account-email-input"), "someone@example.com");
    await userEvent.click(screen.getByTestId("account-email-submit"));

    await userEvent.click(await screen.findByTestId("account-resend"));
    expect(props.onSendOtp).toHaveBeenNthCalledWith(2, "someone@example.com");

    await userEvent.click(screen.getByTestId("account-change-email"));
    expect(props.onChangeEmail).toHaveBeenCalled();
    expect(await screen.findByTestId("account-email-input")).toHaveValue("someone@example.com");
  });

  it("shows the flow's error in place, as an alert", async () => {
    await renderAccount({ step: "code", error: "That code doesn't match. Check it and try again." });
    expect(screen.getByTestId("account-error")).toHaveRole("alert");
    expect(screen.getByTestId("account-error")).toHaveTextContent("That code doesn't match");
  });

  it("holds every door while a sign-in is in flight", async () => {
    const { props } = await renderAccount({ pending: true });
    await userEvent.click(screen.getByTestId("account-apple"));
    await userEvent.type(screen.getByTestId("account-email-input"), "someone@example.com");
    await userEvent.click(screen.getByTestId("account-email-submit"));

    expect(props.onSocial).not.toHaveBeenCalled();
    expect(props.onSendOtp).not.toHaveBeenCalled();
  });
});

/**
 * The wait between one code and the next is the flow's; the screen renders it and holds
 * every way to a code shut while it runs, wherever the person is standing.
 */
describe("Account, while another code is still on its wait", () => {
  const waiting = 12;

  it("counts the wait down on the resend and refuses the click", async () => {
    const { props } = await renderAccount({ step: "code", nextCodeIn: waiting });

    expect(screen.getByTestId("account-resend")).toHaveTextContent(`Send a new code in ${waiting}s`);
    await userEvent.click(screen.getByTestId("account-resend"));

    expect(props.onSendOtp).not.toHaveBeenCalled();
  });

  // "Use a different email" walks back to the button under the field, which asks for a
  // code by another name. Showing the wait only on the resend would leave that one open.
  it("counts the same wait down on the email step and refuses the submit", async () => {
    const { props } = await renderAccount({ step: "method", nextCodeIn: waiting });

    await userEvent.type(screen.getByTestId("account-email-input"), "someone@example.com");
    expect(screen.getByTestId("account-email-submit")).toHaveTextContent(`Continue with email in ${waiting}s`);
    await userEvent.click(screen.getByTestId("account-email-submit"));

    expect(props.onSendOtp).not.toHaveBeenCalled();
  });

  it("leaves the providers open — they ask for no code", async () => {
    const { props } = await renderAccount({ nextCodeIn: waiting });
    await userEvent.click(screen.getByTestId("account-google"));

    expect(props.onSocial).toHaveBeenCalledWith("google");
  });
});
