// Deliberately violates biome/notification-provider-imports.grit for all three vendors.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import { MailService } from "@sendgrid/mail";
import { Expo } from "expo-server-sdk";
import twilio, { Twilio } from "twilio";

export const canary = [MailService, Expo, twilio, Twilio];
