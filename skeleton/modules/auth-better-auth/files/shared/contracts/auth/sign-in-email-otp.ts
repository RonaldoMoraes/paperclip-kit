import { z } from "zod";
import { SessionUser } from "./session";

/** `POST /api/auth/sign-in/email-otp` — step 2: the code is exchanged for a session. */
export const SignInEmailOtpResponse = z.object({
  token: z.string(),
  user: SessionUser,
});
export type SignInEmailOtpResponse = z.infer<typeof SignInEmailOtpResponse>;

/** Better Auth's error envelope for a rejected code — what `otpFailure` classifies. */
export const AuthErrorResponse = z.object({
  code: z.string(),
  message: z.string(),
});
export type AuthErrorResponse = z.infer<typeof AuthErrorResponse>;
