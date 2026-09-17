import { z } from "zod";

/** `POST /api/auth/email-otp/send-verification-otp` — step 1 of the email-code sign-in: a code goes out. */
export const SendVerificationOtpResponse = z.object({ success: z.boolean() });
export type SendVerificationOtpResponse = z.infer<typeof SendVerificationOtpResponse>;
