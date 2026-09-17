import { http } from "msw";
import { json } from "../mock-response";
import { signedOutCookie } from "../mock-session";
import { SignOutResponse } from "./sign-out";

export const fixture = SignOutResponse.parse({ success: true });

export const handlers = [
  // The signed-out marker is the whole sign-out: the next `get-session` finds nobody
  // because the jar (or SecureStore) now says so — and keeps saying so across a reload.
  http.post("*/api/auth/sign-out", () => json(fixture, { headers: { "set-cookie": signedOutCookie() } })),
];
