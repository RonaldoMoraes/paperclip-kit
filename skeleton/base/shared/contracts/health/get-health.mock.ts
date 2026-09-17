import { http } from "msw";
import { json } from "../mock-response";
import { GetHealthResponse } from "./get-health";

/** The default answer: up, with a version no real build carries so a mocked run is recognisable. */
export const fixture = GetHealthResponse.parse({ ok: true, version: "0.0.0-mock" });

export const handlers = [http.get("*/api/health", () => json(fixture))];
