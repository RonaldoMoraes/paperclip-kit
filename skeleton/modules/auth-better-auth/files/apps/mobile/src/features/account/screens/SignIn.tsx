import { useForm, useStore } from "@tanstack/react-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { EmailAddress, OTP_EXPIRY_MINUTES, OTP_LENGTH, VerificationCode } from "@contracts/auth/credentials";
import type { SocialProvider } from "@contracts/auth/errors";
import { waitLabel } from "@contracts/auth/send-cooldown";
import { ACCOUNT_COPY } from "@domain/account/copy";
import { fill } from "@domain/copy";
import { cn } from "@ui/cn";
import { Button } from "@ui/components/Button";
import { clearFieldComplaint, useFieldComplaint } from "@ui/fieldComplaint";
import { withMarks } from "~/lib/copyMarks";

/**
 * A TextInput takes its size from `style`, never from a scale token: every token carries
 * a line-height, and a line-height has iOS lay the input's text below the box's centre
 * and clip descenders. Size only, no line-height.
 */
const EMAIL_SIZE = { fontSize: 16 } as const;
const CODE_SIZE = { fontSize: 24, letterSpacing: 6 } as const;

/**
 * Sign-in — the web's screen, native: a provider is one tap; the email code is two steps,
 * and the second is state rather than a route. Props in, testIDs out — the web's ids
 * (`account-*`), so one element catalog serves both fronts. The wait between codes is the
 * hook's, rendered here on every way to a code.
 */
type Props = {
  step: "method" | "code";
  pending: boolean;
  error: string | null;
  /** Seconds before another code may be asked for; 0 leaves both send buttons open. */
  nextCodeIn: number;
  /** the providers to offer, in order — the server registers the same set */
  providers: readonly SocialProvider[];
  onSocial: (provider: SocialProvider) => void;
  onSendOtp: (email: string) => void;
  onVerifyOtp: (email: string, otp: string) => void;
  onChangeEmail: () => void;
};

const C = ACCOUNT_COPY;

export function SignIn({
  step,
  pending,
  error,
  nextCodeIn,
  providers,
  onSocial,
  onSendOtp,
  onVerifyOtp,
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

  // Both ways to a code: the first send and every one after it. The code already typed
  // belongs to the message being replaced, so it goes with it.
  const sendCode = () => {
    codeForm.reset();
    emailForm.handleSubmit();
  };

  // A provider tap answers whatever the email field complained about: its error belongs to
  // a door no longer in use, and leaving it up would hide the provider's own.
  const chooseProvider = (provider: SocialProvider) => {
    clearFieldComplaint(emailForm, "email");
    onSocial(provider);
  };

  const complaint = shown ? (
    <Text accessibilityRole="alert" testID="account-error" className="mt-4 text-center font-sans text-sm text-error">
      {shown}
    </Text>
  ) : null;

  return (
    <KeyboardAvoidingView className="flex-1 bg-canvas" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView testID="account" contentContainerClassName="px-6 pb-12 pt-16" keyboardShouldPersistTaps="handled">
        {step === "method" ? (
          <View className="mt-8">
            <Text testID="account-title" className="font-sans-bold text-display-2 text-ink">
              {withMarks(C.method.title, { em: "text-ink-brand" })}
            </Text>
            <Text className="mt-4 font-sans text-base leading-relaxed text-ink-secondary">{C.method.body}</Text>

            {providers.length > 0 ? (
              <>
                <View className="mt-8 gap-3">
                  {providers.map((provider) => (
                    <Button
                      key={provider}
                      variant={provider === "apple" ? "ink" : "card"}
                      size="lg"
                      className="w-full"
                      disabled={pending}
                      onPress={() => chooseProvider(provider)}
                      testID={`account-${provider}`}
                    >
                      {C.method.providers[provider]}
                    </Button>
                  ))}
                </View>

                <View className="my-6 flex-row items-center gap-4">
                  <View className="h-px flex-1 bg-line" />
                  <Text className="font-sans text-sm text-ink-tertiary">{C.method.or}</Text>
                  <View className="h-px flex-1 bg-line" />
                </View>
              </>
            ) : null}

            <Text className={cn("font-sans-medium text-sm text-ink-secondary", providers.length === 0 && "mt-8")}>
              {C.method.emailLabel}
            </Text>
            <emailForm.Field name="email" validators={{ onSubmit: EmailAddress }}>
              {(field) => (
                <TextInput
                  accessibilityLabel={C.method.emailLabel}
                  testID="account-email-input"
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  placeholder={C.method.emailPlaceholder}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  editable={!pending}
                  style={EMAIL_SIZE}
                  className="mt-1.5 rounded-card border border-line bg-surface px-4 py-3.5 font-sans text-ink"
                />
              )}
            </emailForm.Field>

            <Button
              variant="primary"
              size="lg"
              className="mt-4 w-full"
              disabled={closed}
              onPress={sendCode}
              testID="account-email-submit"
            >
              {waitLabel(C.method.send, nextCodeIn)}
            </Button>

            {complaint}

            <Text className="mt-4 text-center font-sans text-xs text-ink-tertiary">{C.method.hint}</Text>
          </View>
        ) : (
          <View className="mt-8">
            <Text testID="account-title" className="font-sans-bold text-display-2 text-ink">
              {withMarks(C.code.title, { em: "text-ink-brand" })}
            </Text>
            <Text testID="account-sent-to" className="mt-4 font-sans text-base leading-relaxed text-ink-secondary">
              {fill(C.code.body, { n: OTP_LENGTH, email: sentTo, minutes: OTP_EXPIRY_MINUTES })}
            </Text>

            <Text className="mt-8 font-sans-medium text-sm text-ink-secondary">{C.code.label}</Text>
            <codeForm.Field name="otp" validators={{ onSubmit: VerificationCode }}>
              {(field) => (
                <TextInput
                  accessibilityLabel={C.code.label}
                  testID="account-otp-input"
                  value={field.state.value}
                  onChangeText={(value) => field.handleChange(value.replace(/\D/g, ""))}
                  placeholder={"•".repeat(OTP_LENGTH)}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  editable={!pending}
                  style={CODE_SIZE}
                  className="mt-1.5 rounded-card border border-line bg-surface px-4 py-3.5 text-center font-sans text-ink"
                />
              )}
            </codeForm.Field>

            <Button
              variant="primary"
              size="lg"
              className="mt-4 w-full"
              disabled={pending}
              onPress={() => codeForm.handleSubmit()}
              testID="account-otp-submit"
            >
              {C.code.verify}
            </Button>

            {complaint}

            <View className="mt-6 flex-row items-center justify-center gap-6">
              {/* The wait carries its own label: a button that only greys out reads as
                  broken, where a countdown reads as an answer. */}
              <Pressable accessibilityRole="button" disabled={closed} testID="account-resend" onPress={sendCode}>
                <Text className={cn("font-sans-semibold text-sm", waiting ? "text-ink-tertiary" : "text-ink-brand")}>
                  {waitLabel(C.code.resend, nextCodeIn)}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={pending}
                testID="account-change-email"
                onPress={onChangeEmail}
              >
                <Text className="font-sans text-sm text-ink-secondary">{C.code.changeEmail}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
