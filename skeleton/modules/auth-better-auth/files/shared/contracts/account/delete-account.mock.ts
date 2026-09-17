import { http } from "msw";
import { json, unauthorized } from "../mock-response";
import { readMockSession, signedOutCookie } from "../mock-session";
import { DeleteAccountResponse } from "./delete-account";

export const fixture = DeleteAccountResponse.parse({ deleted: true });

export const handlers = [
  // Deleting is signing out with nothing to come back to: the signed-out marker is the
  // whole of it here, since the mock keeps no users to delete.
  http.delete("*/api/account", ({ cookies }) => {
    if (!readMockSession(cookies)) return unauthorized();
    return json(fixture, { headers: { "set-cookie": signedOutCookie() } });
  }),
];
