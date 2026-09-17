import { z } from "zod";

/**
 * `POST /api/auth/sign-in/social` — step 1 of a provider round-trip: the client asks where
 * to send the person, and Better Auth answers with the provider's authorize URL.
 *
 * The client takes the whole page there itself when `redirect` is true (the Expo client
 * opens the system browser instead), so nothing in either app reads the body beyond these
 * two fields.
 */
export const SignInSocialResponse = z.object({
  url: z.string().min(1),
  redirect: z.boolean(),
});
export type SignInSocialResponse = z.infer<typeof SignInSocialResponse>;
