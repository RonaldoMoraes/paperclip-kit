import { useForm, useStore } from "@tanstack/react-form";
import { EmailAddress, OTP_EXPIRY_MINUTES, OTP_LENGTH, VerificationCode } from "@contracts/auth/credentials";
import type { SocialProvider } from "@contracts/auth/errors";
import { waitLabel } from "@contracts/auth/send-cooldown";
import { ACCOUNT_COPY } from "@domain/account/copy";
import { fill } from "@domain/copy";
import { cn } from "@ui/cn";
import { Button } from "@ui/components/Button";
import { clearFieldComplaint, useFieldComplaint } from "@ui/fieldComplaint";
import { Screen } from "~/features/shell/components/Screen";
import { withMarks } from "~/lib/copyMarks";

/**
 * Sign-in — two doors, one screen: a provider is one tap; the email code is two steps,
 * and the second is state rather than a route. Props in, testids out (`account-*`);
 * nothing here fetches. The wait between codes is the hook's, rendered here: every way to
 * a code — the send under the field and the resend on the code step — is held shut and
 * counting while it runs, because "use a different email" walks back to the first.
 */
type Props = {
  step: "method" | "code";
  pending: boolean;
  error: string | null;
  /** Seconds before another code may be asked for; 0 leaves both send buttons open. */
  nextCodeIn: number;
  /** the providers to offer, in order — the server registers the same set */
  providers: readonly SocialProvider[];
  onSendOtp: (email: string) => void;
  onVerifyOtp: (email: string, otp: string) => void;
  onSocial: (provider: SocialProvider) => void;
  onChangeEmail: () => void;
};

const C = ACCOUNT_COPY;

export function Account({
  step,
  pending,
  error,
  nextCodeIn,
  providers,
  onSendOtp,
  onVerifyOtp,
  onSocial,
  onChangeEmail,
}: Props) {
  const emailForm = useForm({
    defaultValues: { email: "" },
    onSubmit: ({ value }) => onSendOtp(value.email.trim()),
  });

  const sentTo = useStore(emailForm.store, (state) => state.values.email.trim());

  const codeForm = useForm({
    defaultValues: { otp: "" },
    onSubmit: ({ value }) => onVerifyOtp(sentTo, value.otp),
  });

  const emailComplaint = useFieldComplaint(emailForm, "email");
  const codeComplaint = useFieldComplaint(codeForm, "otp");

  const shown = (step === "method" ? emailComplaint : codeComplaint) ?? error;

  const waiting = nextCodeIn > 0;
  const closed = pending || waiting;

  // Both ways to a code: the first send and every resend. The code already typed belongs
  // to the one being replaced, so it goes with it. A submit that fails validation shows
  // nothing on the code step, where there is no email field to carry the line — reaching
  // that step required an address this same schema accepted.
  const sendCode = () => {
    codeForm.reset();
    emailForm.handleSubmit();
  };

  // A provider takes the whole page away; the email field's complaint belongs to a door
  // no longer in use and must not be what the person comes back to.
  const chooseProvider = (provider: SocialProvider) => {
    clearFieldComplaint(emailForm, "email");
    onSocial(provider);
  };

  const complaint = shown ? (
    <p role="alert" data-testid="account-error" className="mt-4 text-center text-sm text-error">
      {shown}
    </p>
  ) : null;

  return (
    <Screen tag="account" className="px-6 pb-12 pt-16">
      {step === "method" ? (
        <>
          <h1 data-testid="account-title" className="font-serif text-display-2 text-ink">
            {withMarks(C.method.title, { em: "italic text-ink-brand" })}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-secondary">{C.method.body}</p>

          {providers.length > 0 ? (
            <>
              <div className="mt-8 flex flex-col gap-3">
                {providers.map((provider) => (
                  <Button
                    key={provider}
                    type="button"
                    size="lg"
                    variant={provider === "apple" ? "ink" : "card"}
                    data-testid={`account-${provider}`}
                    disabled={pending}
                    onClick={() => chooseProvider(provider)}
                    className="w-full"
                  >
                    {C.method.providers[provider]}
                  </Button>
                ))}
              </div>

              <div className="my-6 flex items-center gap-4">
                <span className="h-px flex-1 bg-line" />
                <span className="text-sm text-ink-tertiary">{C.method.or}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          ) : null}

          {/* `noValidate` leaves the schema as the only judge of the address: the browser's
              own bubble on `type="email"` would preempt it, and mobile has no such bubble —
              the same typo would be answered two different ways. */}
          <form
            noValidate
            className={cn(providers.length === 0 && "mt-8")}
            onSubmit={(event) => {
              event.preventDefault();
              sendCode();
            }}
          >
            <label className="block" htmlFor="account-email">
              <span className="text-sm font-medium text-ink-secondary">{C.method.emailLabel}</span>
              <emailForm.Field name="email" validators={{ onSubmit: EmailAddress }}>
                {(field) => (
                  <input
                    id="account-email"
                    type="email"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={C.method.emailPlaceholder}
                    data-testid="account-email-input"
                    autoComplete="email"
                    className="card mt-1.5 w-full rounded-card px-4 py-3.5 text-base text-ink placeholder:text-ink-tertiary"
                  />
                )}
              </emailForm.Field>
            </label>

            <Button
              type="submit"
              data-testid="account-email-submit"
              variant="primary"
              size="lg"
              disabled={closed}
              className="mt-4 w-full"
            >
              {waitLabel(C.method.send, nextCodeIn)}
            </Button>
          </form>

          {complaint}

          <p className="mt-4 text-center text-xs text-ink-tertiary">{C.method.hint}</p>
        </>
      ) : (
        <>
          <h1 data-testid="account-title" className="font-serif text-display-2 text-ink">
            {withMarks(C.code.title, { em: "italic text-ink-brand" })}
          </h1>
          <p data-testid="account-sent-to" className="mt-4 text-[15px] leading-relaxed text-ink-secondary">
            {fill(C.code.body, { n: OTP_LENGTH, email: sentTo, minutes: OTP_EXPIRY_MINUTES })}
          </p>

          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              codeForm.handleSubmit();
            }}
          >
            <label className="mt-8 block" htmlFor="account-otp">
              <span className="text-sm font-medium text-ink-secondary">{C.code.label}</span>
              <codeForm.Field name="otp" validators={{ onSubmit: VerificationCode }}>
                {(field) => (
                  <input
                    id="account-otp"
                    type="text"
                    inputMode="numeric"
                    data-testid="account-otp-input"
                    autoComplete="one-time-code"
                    maxLength={OTP_LENGTH}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value.replace(/\D/g, ""))}
                    placeholder={"•".repeat(OTP_LENGTH)}
                    className="card tnum mt-1.5 w-full rounded-card px-4 py-3.5 text-center text-title-1 tracking-[0.3em] text-ink placeholder:text-ink-tertiary"
                  />
                )}
              </codeForm.Field>
            </label>

            <Button type="submit" size="lg" disabled={pending} data-testid="account-otp-submit" className="mt-4 w-full">
              {C.code.verify}
            </Button>
          </form>

          {complaint}

          <div className="mt-6 flex items-center justify-center gap-6">
            {/* The wait carries its own label: a button that only greys out reads as broken,
                where a countdown reads as an answer. */}
            <button
              type="button"
              data-testid="account-resend"
              disabled={closed}
              onClick={sendCode}
              className={cn(
                "text-sm font-semibold transition-colors duration-150 ease-brand disabled:opacity-40",
                waiting ? "text-ink-tertiary" : "text-ink-brand"
              )}
            >
              {waitLabel(C.code.resend, nextCodeIn)}
            </button>
            <button
              type="button"
              data-testid="account-change-email"
              disabled={pending}
              onClick={onChangeEmail}
              className="text-sm text-ink-tertiary transition-colors duration-150 ease-brand disabled:opacity-40"
            >
              {C.code.changeEmail}
            </button>
          </div>
        </>
      )}
    </Screen>
  );
}
