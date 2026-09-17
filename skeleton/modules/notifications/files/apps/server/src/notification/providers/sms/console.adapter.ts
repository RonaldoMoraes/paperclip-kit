import type { SmsRequest } from "../../../common/ports/notification";
import type { SmsAdapter } from "../provider.types";

/**
 * The SMS sink in fake mode: one console line per send, body included so a code is
 * readable in the terminal when no message is sent. Never throws.
 */
export class ConsoleSmsAdapter implements SmsAdapter {
  readonly provider = "console";

  async send(request: SmsRequest): Promise<void> {
    console.log("[notification:sms:console]", { to: request.to, body: request.body });
  }
}
