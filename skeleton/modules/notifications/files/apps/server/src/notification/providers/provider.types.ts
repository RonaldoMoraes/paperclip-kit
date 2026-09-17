import type { EmailRequest, PushRequest, SmsRequest } from "../../common/ports/notification";

/**
 * An adapter is dumb transport: it maps one already-validated request onto one vendor
 * call and throws when the vendor refuses. No retries, no logging, no defaults beyond the
 * configured sender — timing, telemetry and error wrapping are the service's, so every
 * channel reports the same way. `provider` names the vendor in telemetry and the boot log
 * ("sendgrid", "twilio", "expo", "console").
 */
export interface EmailAdapter {
  readonly provider: string;
  send(request: EmailRequest): Promise<void>;
}

export interface SmsAdapter {
  readonly provider: string;
  send(request: SmsRequest): Promise<void>;
}

export interface PushAdapter {
  readonly provider: string;
  send(request: PushRequest): Promise<void>;
}
