import type { PushRequest } from "../../../common/ports/notification";
import type { PushAdapter } from "../provider.types";

/** The push sink in fake mode: one console line per send, nothing reaches a device. Never throws. */
export class ConsolePushAdapter implements PushAdapter {
  readonly provider = "console";

  async send(request: PushRequest): Promise<void> {
    console.log("[notification:push:console]", {
      to: request.to,
      title: request.title,
      body: request.body,
      data: request.data,
    });
  }
}
