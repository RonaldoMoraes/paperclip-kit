import { Expo, type ExpoPushErrorTicket, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import { NotificationError, type PushRequest } from "../../../common/ports/notification";
import type { PushAdapter } from "../provider.types";

/** What the adapter asks of the SDK — a spec hands it a stub, the factory the real client. */
export type ExpoPushClient = Pick<Expo, "chunkPushNotifications" | "sendPushNotificationsAsync">;

/**
 * Expo's push service behind the push channel: one message fanned out to every token,
 * in the chunks the service accepts, sent one chunk at a time as Expo asks. Imported only
 * here — the notification-provider-imports guard keeps the SDK out of everything else.
 *
 * A ticket is the service's answer per message, and an error ticket means that device
 * was not reached — so one is a failed send, not a success with a footnote.
 */
export class ExpoPushAdapter implements PushAdapter {
  readonly provider = "expo";
  private readonly expo: ExpoPushClient;

  constructor(config: { accessToken?: string }, expo?: ExpoPushClient) {
    this.expo = expo ?? new Expo({ accessToken: config.accessToken });
  }

  async send(request: PushRequest): Promise<void> {
    const tokens = Array.isArray(request.to) ? request.to : [request.to];
    const rejected = tokens.filter((token) => !Expo.isExpoPushToken(token));
    if (rejected.length > 0) {
      throw new NotificationError(
        "invalid_request",
        `[notification] ${rejected.length} of ${tokens.length} push token(s) are not Expo push tokens.`,
        { channel: "push" }
      );
    }

    const message: ExpoPushMessage = {
      to: tokens,
      title: request.title,
      body: request.body,
      ...(request.data !== undefined && { data: request.data }),
    };
    const tickets: ExpoPushTicket[] = [];
    try {
      for (const chunk of this.expo.chunkPushNotifications([message])) {
        tickets.push(...(await this.expo.sendPushNotificationsAsync(chunk)));
      }
    } catch (error) {
      throw new NotificationError(
        "provider_error",
        `[notification] expo push send failed: ${error instanceof Error ? error.message : String(error)}`,
        { channel: "push" },
        { cause: error }
      );
    }

    const failed = tickets.filter((ticket): ticket is ExpoPushErrorTicket => ticket.status === "error");
    if (failed.length > 0) {
      throw new NotificationError(
        "provider_error",
        `[notification] expo rejected ${failed.length} of ${tickets.length} push message(s): ${failed[0].message}`,
        { channel: "push" },
        { cause: failed }
      );
    }
  }
}
