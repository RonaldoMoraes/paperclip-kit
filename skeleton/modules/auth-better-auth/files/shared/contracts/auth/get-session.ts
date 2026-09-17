import type { z } from "zod";
import { SessionRecord } from "./session";

/**
 * `GET /api/auth/get-session` — the session probe. `null` means signed out.
 *
 * Better Auth owns this route, and the apps never call it through `http`: the auth
 * client owns it on every platform (`authClient.getSession()` on web, `useSession()` on
 * mobile). The schema stays because the mock beside it must answer in the shape Better
 * Auth answers in, and `parse` at import is what proves it still does.
 */
export const GetSessionResponse = SessionRecord.nullable();
export type GetSessionResponse = z.infer<typeof GetSessionResponse>;
