import { MailService } from "@sendgrid/mail";
import { type EmailRequest, NotificationError } from "../../../common/ports/notification";
import type { EmailAdapter } from "../provider.types";

/** What the adapter asks of the SDK — a spec hands it a stub, the factory the real client. */
export type SendgridMailer = Pick<MailService, "setApiKey" | "send">;

/**
 * SendGrid behind the email channel. Imported only here — the
 * notification-provider-imports guard keeps the SDK out of everything else. Its own
 * `MailService` instance, so the key never lands on the package's shared singleton.
 */
export class SendgridEmailAdapter implements EmailAdapter {
  readonly provider = "sendgrid";
  private readonly mailer: SendgridMailer;

  constructor(
    private readonly config: { apiKey: string; fromEmail: string },
    mailer: SendgridMailer = new MailService()
  ) {
    this.mailer = mailer;
    this.mailer.setApiKey(config.apiKey);
  }

  async send(request: EmailRequest): Promise<void> {
    try {
      await this.mailer.send({
        to: request.to,
        from: request.from ?? this.config.fromEmail,
        subject: request.subject,
        html: request.html,
        ...(request.text !== undefined && { text: request.text }),
      });
    } catch (error) {
      throw new NotificationError(
        "provider_error",
        `[notification] sendgrid email send failed: ${error instanceof Error ? error.message : String(error)}`,
        { channel: "email" },
        { cause: error }
      );
    }
  }
}
