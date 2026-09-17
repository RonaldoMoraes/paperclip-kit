import { z } from "zod";

/**
 * What the email-code door accepts before anything is sent, and what a person is told
 * when what they typed is not it.
 *
 * Web and mobile validate their sign-in form against these same schemas, so one rule and
 * one sentence serve both. The copy sits with the rule because a message kept in a screen
 * drifts from the rule the other screen enforces. PLACEHOLDER WORDING on the messages.
 */

/** How long a code is. The server's emailOTP plugin takes its `otpLength` from here. */
export const OTP_LENGTH = 5;

/** How long a code lives: the server's `expiresIn` and the line the screens print, from one number. */
export const OTP_EXPIRY_MINUTES = 5;

const INCOMPLETE_CODE = "Enter the full code from the email.";

/**
 * Trimmed before it is judged: an address arrives pasted with whitespace often enough that
 * refusing it would be the app's fault rather than the person's.
 */
export const EmailAddress = z
  .string()
  .trim()
  .min(1, { error: "Enter your email first." })
  .pipe(z.email({ error: "That doesn't look like an email address." }));

/** The code as typed. The screens keep non-digits out of the field; this refuses the rest. */
export const VerificationCode = z
  .string()
  .length(OTP_LENGTH, { error: INCOMPLETE_CODE })
  .regex(/^\d+$/, { error: INCOMPLETE_CODE });
