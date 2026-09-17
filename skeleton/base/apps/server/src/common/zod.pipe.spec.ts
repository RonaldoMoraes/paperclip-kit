import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodValidationError, ZodValidationPipe } from "./zod.pipe";

const Body = z.object({ done: z.boolean() });
const bodyMetadata = { type: "body" } as const;

describe("ZodValidationPipe", () => {
  it("hands the controller the parsed value, not the raw one", () => {
    const pipe = new ZodValidationPipe(Body);

    expect(pipe.transform({ done: true, extra: "dropped" }, bodyMetadata)).toEqual({ done: true });
  });

  it("rejects with zod's own issues, so the answer can carry them", () => {
    const pipe = new ZodValidationPipe(Body);

    const failure = (() => {
      try {
        pipe.transform({}, bodyMetadata);
      } catch (error) {
        return error;
      }
    })();

    expect(failure).toBeInstanceOf(ZodValidationError);
    expect((failure as ZodValidationError).issues).toHaveLength(1);
    expect((failure as ZodValidationError).issues[0]).toMatchObject({ path: ["done"] });
    expect(failure).not.toBeInstanceOf(BadRequestException);
  });

  it("names what was rejected — a body, a query string and a param fail differently", () => {
    const pipe = new ZodValidationPipe(Body);

    expect(() => pipe.transform({}, { type: "query" } as const)).toThrow(/query/);
    expect(() => pipe.transform({}, { type: "param" } as const)).toThrow(/param/);
    expect(() => pipe.transform({}, bodyMetadata)).toThrow(/body/);
  });
});
