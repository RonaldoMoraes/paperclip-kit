import { z } from "zod";

/** `POST /api/auth/sign-out` — the session is deleted and the cookie cleared. */
export const SignOutResponse = z.object({ success: z.boolean() });
export type SignOutResponse = z.infer<typeof SignOutResponse>;
