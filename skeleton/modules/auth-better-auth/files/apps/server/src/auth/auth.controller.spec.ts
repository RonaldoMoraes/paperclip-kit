import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";

const handler = vi.fn();
const toNodeHandler = vi.fn(() => handler);

vi.mock("better-auth/node", () => ({ toNodeHandler: (instance: unknown) => toNodeHandler(instance) }));

import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  it("hands every /api/auth request to Better Auth, request and response and all", async () => {
    const auth = { marker: "the better auth instance" } as never;
    const req = { url: "/api/auth/get-session" } as never;
    const res = { end: vi.fn() } as never;

    await new AuthController(auth).handle(req, res);

    expect(toNodeHandler).toHaveBeenCalledWith(auth);
    expect(handler).toHaveBeenCalledWith(req, res);
  });
});
