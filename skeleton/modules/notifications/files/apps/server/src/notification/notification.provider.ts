import type { Provider } from "@nestjs/common";
import { NOTIFICATION_CLIENT, type NotificationClient } from "../common/ports/notification";
import { TELEMETRY, type Telemetry } from "../common/ports/telemetry";
import { type NotificationConfig, loadNotificationConfig } from "./notification.config";
import { type NotificationAdapters, NotificationService } from "./notification.service";
import { ConsoleEmailAdapter } from "./providers/email/console.adapter";
import { SendgridEmailAdapter } from "./providers/email/sendgrid.adapter";
import { ConsolePushAdapter } from "./providers/push/console.adapter";
import { ExpoPushAdapter } from "./providers/push/expo.adapter";
import { ConsoleSmsAdapter } from "./providers/sms/console.adapter";
import { TwilioSmsAdapter } from "./providers/sms/twilio.adapter";

/** The adapters a config asks for: three console sinks in fake mode, the vendors in real. */
function adaptersFor(config: NotificationConfig): NotificationAdapters {
  if (config.mode === "real") {
    return {
      email: new SendgridEmailAdapter(config.email),
      sms: new TwilioSmsAdapter(config.sms),
      push: new ExpoPushAdapter(config.push),
    };
  }
  return { email: new ConsoleEmailAdapter(), sms: new ConsoleSmsAdapter(), push: new ConsolePushAdapter() };
}

/**
 * Builds the client a config describes and says so once through telemetry, so a boot log
 * always states whether this process can send anything. The one place an adapter is
 * constructed: swapping a vendor is a new adapter under `providers/` and one line here.
 */
export function createNotificationClient(config: NotificationConfig, telemetry: Telemetry): NotificationService {
  const service = new NotificationService({ mode: config.mode, adapters: adaptersFor(config), telemetry });
  telemetry.log("info", "[notification] ready", { mode: service.mode, ...service.providers });
  return service;
}

/**
 * The port's provider, bound by the global `PortsModule` from `KIT_PORTS` in place of the
 * console default. Env is read inside the factory, so importing this file reads none, and
 * a missing key in real mode fails at boot — before a request could reach a send.
 */
export const NotificationProvider: Provider = {
  provide: NOTIFICATION_CLIENT,
  inject: [TELEMETRY],
  useFactory: (telemetry: Telemetry): NotificationClient =>
    createNotificationClient(loadNotificationConfig(process.env), telemetry),
};
