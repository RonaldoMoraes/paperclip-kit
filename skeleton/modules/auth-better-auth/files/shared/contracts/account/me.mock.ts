import { http } from "msw";
import { json, unauthorized } from "../mock-response";
import { MOCK_USER, readMockSession } from "../mock-session";
import { MeResponse } from "./me";

/** The default answer: the mock user, who a mocked run boots as. */
export const fixture = MeResponse.parse(MOCK_USER);

export const handlers = [
  http.get("*/api/account/me", ({ cookies }) => {
    const user = readMockSession(cookies);
    if (!user) return unauthorized();
    return json(MeResponse.parse(user));
  }),
];
