import { z } from "zod";

/**
 * The slice of Better Auth's session payload every app reads.
 *
 * Better Auth owns its routes and their full shape; these schemas are deliberately narrow
 * — the fields the front ends and `GET /api/account/me` actually consume — so an upgrade
 * that adds a field does not invalidate a contract nobody was reading. `id` is a string
 * on the wire even though the database keys rows with integers (`generateId: "serial"`);
 * `userIdOf` on the server is the seam back to a number.
 */
export const SessionUser = z.object({
  id: z.string().min(1),
  email: z.string(),
  name: z.string().nullable().optional(),
  emailVerified: z.boolean().optional(),
});
export type SessionUser = z.infer<typeof SessionUser>;

/**
 * The signed-in payload as a route reads it: who, and until when. `expiresAt` is an
 * ISO-8601 string on the wire; each app's `lib/session` normalises the auth client's
 * `Date` back to it at its own seam. What rides here beyond these two is the server's
 * decision (`customSession` in `apps/server/src/auth/better-auth.ts`): a module that adds
 * an entitlement widens this schema in the same change.
 */
export const SessionRecord = z.object({
  user: SessionUser,
  session: z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
    expiresAt: z.iso.datetime(),
  }),
});
export type SessionRecord = z.infer<typeof SessionRecord>;
