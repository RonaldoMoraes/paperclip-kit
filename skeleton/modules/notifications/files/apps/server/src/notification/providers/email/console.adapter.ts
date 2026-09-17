import type { EmailRequest } from "../../../common/ports/notification";
import type { EmailAdapter } from "../provider.types";

/**
 * The email sink in fake mode: one console line per send, nothing leaves the machine.
 * The body is printed too — a sign-in code has to be readable in the terminal when no
 * mail is sent. Never throws.
 */
export class ConsoleEmailAdapter implements EmailAdapter {
  readonly provider = "console";

  async send(request: EmailRequest): Promise<void> {
    console.log("[notification:email:console]", {
      to: request.to,
      subject: request.subject,
      text: request.text ?? request.html,
    });
  }
}
