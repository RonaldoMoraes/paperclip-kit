import type { Provider } from "@nestjs/common";
import { z } from "zod";

/**
 * The notification port: how a feature sends an email, an SMS or a push without naming a
 * vendor. Base binds the console client; the `notifications` module replaces it with real
 * adapters through `KIT_PORTS`. Consumers inject `NOTIFICATION_CLIENT`, never a class.
 */

export type NotificationChannel = "email" | "sms" | "push";

export const EmailRequest = z.object({
  to: z.email(),
  /** overrides the configured sender; the adapter supplies the default */
  from: z.email().optional(),
  subject: z.string().min(1).max(200),
  html: z.string().min(1),
  /** plain-text fallback for clients that render no HTML */
  text: z.string().optional(),
});
export type EmailRequest = z.infer<typeof EmailRequest>;

export const SmsRequest = z.object({
  /** E.164, the one format every SMS provider accepts */
  to: z.string().regex(/^\+[1-9]\d{6,14}$/, "E.164 phone number"),
  from: z.string().optional(),
  body: z.string().min(1).max(1600),
});
export type SmsRequest = z.infer<typeof SmsRequest>;

export const PushRequest = z.object({
  /** one push token, or the tokens of every device a person carries */
  to: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type PushRequest = z.infer<typeof PushRequest>;

export type NotificationErrorCode = "invalid_request" | "configuration" | "provider_error";

/** The one error a send rejects with, so a caller branches on `code` and never on a vendor's. */
export class NotificationError extends Error {
  constructor(
    readonly code: NotificationErrorCode,
    message: string,
    readonly context: { channel: NotificationChannel },
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "NotificationError";
  }
}

export interface NotificationClient {
  sendEmail(request: EmailRequest): Promise<void>;
  sendSms(request: SmsRequest): Promise<void>;
  sendPush(request: PushRequest): Promise<void>;
}

export const NOTIFICATION_CLIENT = Symbol("NOTIFICATION_CLIENT");

/**
 * The default: every send is one console line and nothing leaves the machine. It still
 * refuses a malformed request, so a feature developed against the console default cannot
 * pass a real adapter something it would reject.
 */
export class ConsoleNotificationClient implements NotificationClient {
  async sendEmail(request: EmailRequest): Promise<void> {
    const email = accept("email", EmailRequest, request);
    console.log("[notification] email", { to: email.to, subject: email.subject });
  }

  async sendSms(request: SmsRequest): Promise<void> {
    const sms = accept("sms", SmsRequest, request);
    console.log("[notification] sms", { to: sms.to, length: sms.body.length });
  }

  async sendPush(request: PushRequest): Promise<void> {
    const push = accept("push", PushRequest, request);
    console.log("[notification] push", { to: push.to, title: push.title });
  }
}

function accept<T>(channel: NotificationChannel, schema: z.ZodType<T>, request: T): T {
  const parsed = schema.safeParse(request);
  if (parsed.success) return parsed.data;
  throw new NotificationError(
    "invalid_request",
    `The ${channel} request is not valid.`,
    { channel },
    {
      cause: parsed.error,
    }
  );
}

export const NotificationConsoleProvider: Provider = {
  provide: NOTIFICATION_CLIENT,
  useFactory: (): NotificationClient => new ConsoleNotificationClient(),
};
