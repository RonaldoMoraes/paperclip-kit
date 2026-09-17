export type NotificationMode = "fake" | "real";

export type NotificationConfig =
  | { mode: "fake" }
  | {
      mode: "real";
      email: { apiKey: string; fromEmail: string };
      sms: { accountSid: string; authToken: string; fromNumber: string };
      /** Expo's push service asks for a token only when the project turned on enhanced push security */
      push: { accessToken?: string };
    };

const REAL_KEYS = [
  "SENDGRID_API_KEY",
  "NOTIFICATION_FROM_EMAIL",
  "SMS_ACCOUNT_SID",
  "SMS_AUTH_TOKEN",
  "SMS_FROM",
] as const;

/**
 * The only reader of `process.env` for this domain, called inside the port's factory so
 * a missing key fails at boot and a spec that imports anything else reads none.
 *
 * Fake is the default in every environment: an accidental real send is worse than a
 * missed one, so `real` has to be asked for by name and refuses to start without every
 * key it needs. A key that is set in fake mode is ignored — fake means nothing leaves.
 */
export function loadNotificationConfig(env: Record<string, string | undefined>): NotificationConfig {
  const mode = env.NOTIFICATION_MODE?.trim() || "fake";
  if (mode !== "fake" && mode !== "real") {
    throw new Error(`[notification] NOTIFICATION_MODE must be "fake" or "real", got "${mode}".`);
  }
  if (mode === "fake") return { mode };

  const value = (key: (typeof REAL_KEYS)[number]): string => env[key]?.trim() ?? "";
  const missing = REAL_KEYS.filter((key) => value(key) === "");
  if (missing.length > 0) {
    throw new Error(
      `[notification] NOTIFICATION_MODE=real but required vars are missing: ${missing.join(", ")}. ` +
        "Set them or run with NOTIFICATION_MODE=fake."
    );
  }

  return {
    mode,
    email: { apiKey: value("SENDGRID_API_KEY"), fromEmail: value("NOTIFICATION_FROM_EMAIL") },
    sms: { accountSid: value("SMS_ACCOUNT_SID"), authToken: value("SMS_AUTH_TOKEN"), fromNumber: value("SMS_FROM") },
    push: { accessToken: env.EXPO_ACCESS_TOKEN?.trim() || undefined },
  };
}
