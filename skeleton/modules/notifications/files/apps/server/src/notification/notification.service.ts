import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  EmailRequest,
  type NotificationChannel,
  type NotificationClient,
  NotificationError,
  type NotificationErrorCode,
  PushRequest,
  SmsRequest,
} from "../common/ports/notification";
import type { Telemetry } from "../common/ports/telemetry";
import type { NotificationMode } from "./notification.config";
import type { EmailAdapter, PushAdapter, SmsAdapter } from "./providers/provider.types";

export type NotificationAdapters = { email: EmailAdapter; sms: SmsAdapter; push: PushAdapter };

export type NotificationServiceDeps = {
  mode: NotificationMode;
  adapters: NotificationAdapters;
  telemetry: Telemetry;
  /** the clock in milliseconds, injected so a spec can pin `durationMs` */
  now?: () => number;
  /** the id minted per send, injected so a spec can find its own event */
  requestId?: () => string;
};

/** The one event every send emits, whatever happened; `telemetry.event` counts it. */
export const NOTIFICATION_SEND_EVENT = "notification.send";

/**
 * What telemetry hears about one send: who handled it and how it went — never the
 * recipient, never the content. `refused` is a request the port's schema rejected before
 * any adapter ran; `failure` is an adapter that threw.
 */
export type NotificationSendEvent = {
  requestId: string;
  channel: NotificationChannel;
  provider: string;
  mode: NotificationMode;
  status: "success" | "failure" | "refused";
  durationMs: number;
  errorCode?: NotificationErrorCode;
};

type Adapter<Request> = { readonly provider: string; send(request: Request): Promise<void> };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The port's implementation: one place that validates, times, reports and wraps, so the
 * three channels behave identically and an adapter stays a dumb transport. A caller sees
 * `NotificationError` and nothing else — an adapter's own throw is wrapped, its
 * `NotificationError` passes through untouched.
 */
export class NotificationService implements NotificationClient {
  readonly mode: NotificationMode;
  /** the adapter behind each channel, by name — what the boot log and a spec read */
  readonly providers: Record<NotificationChannel, string>;

  constructor(private readonly deps: NotificationServiceDeps) {
    this.mode = deps.mode;
    this.providers = {
      email: deps.adapters.email.provider,
      sms: deps.adapters.sms.provider,
      push: deps.adapters.push.provider,
    };
  }

  sendEmail(request: EmailRequest): Promise<void> {
    return this.send("email", EmailRequest, this.deps.adapters.email, request);
  }

  sendSms(request: SmsRequest): Promise<void> {
    return this.send("sms", SmsRequest, this.deps.adapters.sms, request);
  }

  sendPush(request: PushRequest): Promise<void> {
    return this.send("push", PushRequest, this.deps.adapters.push, request);
  }

  private async send<Request>(
    channel: NotificationChannel,
    schema: z.ZodType<Request>,
    adapter: Adapter<Request>,
    request: Request
  ): Promise<void> {
    const { telemetry } = this.deps;
    const now = this.deps.now ?? Date.now;
    const requestId = (this.deps.requestId ?? randomUUID)();
    const context = { requestId, channel, provider: adapter.provider, mode: this.mode };

    const parsed = schema.safeParse(request);
    if (!parsed.success) {
      const refused = new NotificationError(
        "invalid_request",
        `The ${channel} request is not valid.`,
        { channel },
        {
          cause: parsed.error,
        }
      );
      this.report({ ...context, status: "refused", durationMs: 0, errorCode: refused.code });
      telemetry.log("warn", `[notification] ${channel} request refused`, {
        ...context,
        issues: parsed.error.issues.map((issue) => issue.path.map(String).join(".") || "(root)"),
      });
      throw refused;
    }

    const startedAt = now();
    try {
      await adapter.send(parsed.data);
    } catch (cause) {
      const error =
        cause instanceof NotificationError
          ? cause
          : new NotificationError(
              "provider_error",
              `[notification] ${channel} send failed: ${messageOf(cause)}`,
              { channel },
              { cause }
            );
      const durationMs = now() - startedAt;
      this.report({ ...context, status: "failure", durationMs, errorCode: error.code });
      telemetry.log("error", `[notification] ${channel} send failed`, {
        ...context,
        durationMs,
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw error;
    }
    this.report({ ...context, status: "success", durationMs: now() - startedAt });
  }

  private report(event: NotificationSendEvent): void {
    this.deps.telemetry.event(NOTIFICATION_SEND_EVENT, event);
  }
}
