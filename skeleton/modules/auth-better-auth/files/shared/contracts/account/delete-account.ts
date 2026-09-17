import { z } from "zod";
import type { Http } from "../http";

/**
 * `DELETE /api/account` — the signed-in user and everything that hangs off them, gone;
 * the answer clears the session. `401 UNAUTHORIZED` for nobody; `403 FORBIDDEN` when the
 * session is too old for Better Auth to take a deletion on it without a password — the
 * one refusal a person answers by signing in again (`errors.ts`).
 */
export const DeleteAccountResponse = z.object({
  deleted: z.literal(true),
});
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponse>;

export function deleteAccount(http: Http): Promise<DeleteAccountResponse> {
  return http.delete("/api/account", DeleteAccountResponse);
}
