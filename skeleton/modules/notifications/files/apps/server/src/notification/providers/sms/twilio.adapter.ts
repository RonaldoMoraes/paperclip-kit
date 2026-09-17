import { Twilio } from "twilio";
import { NotificationError, type SmsRequest } from "../../../common/ports/notification";
import type { SmsAdapter } from "../provider.types";

/** What the adapter asks of the SDK — a spec hands it a stub, the factory the real client. */
export type TwilioMessenger = {
  messages: { create(options: { to: string; from: string; body: string }): Promise<unknown> };
};

/**
 * Twilio behind the SMS channel. Imported only here — the notification-provider-imports
 * guard keeps the SDK out of everything else.
 */
export class TwilioSmsAdapter implements SmsAdapter {
  readonly provider = "twilio";
  private readonly client: TwilioMessenger;

  constructor(
    private readonly config: { accountSid: string; authToken: string; fromNumber: string },
    client?: TwilioMessenger
  ) {
    this.client = client ?? new Twilio(config.accountSid, config.authToken);
  }

  async send(request: SmsRequest): Promise<void> {
    try {
      await this.client.messages.create({
        to: request.to,
        from: request.from ?? this.config.fromNumber,
        body: request.body,
      });
    } catch (error) {
      throw new NotificationError(
        "provider_error",
        `[notification] twilio sms send failed: ${error instanceof Error ? error.message : String(error)}`,
        { channel: "sms" },
        { cause: error }
      );
    }
  }
}
