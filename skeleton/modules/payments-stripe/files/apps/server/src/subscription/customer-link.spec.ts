import { describe, expect, it, vi } from "vitest";
import { UNMAPPED_USER_FIELD, customerLinkPlugin, withoutUserCustomerLink } from "./customer-link";

const adapter = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: "test",
    create: vi.fn().mockResolvedValue({ id: "1" }),
    update: vi.fn().mockResolvedValue({ id: "1" }),
    updateMany: vi.fn().mockResolvedValue(1),
    findOne: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    transaction: vi.fn(),
    ...over,
  }) as never;

describe("the Stripe customer id the user table has no column for", () => {
  it("is dropped from a user write, and the rest of the write still lands", async () => {
    const base = adapter();
    await withoutUserCustomerLink(base).update({
      model: "user",
      where: [{ field: "id", value: "1" }],
      update: { [UNMAPPED_USER_FIELD]: "cus_1", name: "Someone" },
    });

    expect((base as never as { update: ReturnType<typeof vi.fn> }).update).toHaveBeenCalledWith(
      expect.objectContaining({ update: { name: "Someone" } })
    );
  });

  it("does not write at all when it was the only field — an empty update is a Prisma error", async () => {
    const base = adapter();
    const answer = await withoutUserCustomerLink(base).update({
      model: "user",
      where: [{ field: "id", value: "1" }],
      update: { [UNMAPPED_USER_FIELD]: "cus_1" },
    });

    expect(answer).toBeNull();
    expect((base as never as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
  });

  it("is dropped from a user insert too", async () => {
    const base = adapter();
    await withoutUserCustomerLink(base).create({
      model: "user",
      data: { email: "a@b.c", [UNMAPPED_USER_FIELD]: "cus_1" },
    });

    expect((base as never as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: "a@b.c" } })
    );
  });

  it("leaves every other model alone", async () => {
    const base = adapter();
    const args = { model: "subscription", where: [{ field: "id", value: "1" }], update: { status: "active" } };
    await withoutUserCustomerLink(base).update(args);

    expect((base as never as { update: ReturnType<typeof vi.fn> }).update).toHaveBeenCalledWith(args);
  });
});

describe("who a Stripe customer belongs to", () => {
  it("is answered from the subscription row that names the customer", async () => {
    const findOne = vi.fn().mockResolvedValue({ referenceId: "7" });
    const wrapped = withoutUserCustomerLink(adapter({ findOne }));

    await expect(
      wrapped.findOne({ model: "user", where: [{ field: UNMAPPED_USER_FIELD, value: "cus_1" }] })
    ).resolves.toEqual({ id: "7" });
    expect(findOne).toHaveBeenCalledWith({
      model: "subscription",
      where: [{ field: "stripeCustomerId", value: "cus_1" }],
    });
  });

  // A customer no row names is a subscription made outside this product; the plugin logs
  // and skips it rather than attaching it to somebody.
  it("is nobody when no row names the customer", async () => {
    const wrapped = withoutUserCustomerLink(adapter({ findOne: vi.fn().mockResolvedValue(null) }));

    await expect(
      wrapped.findOne({ model: "user", where: [{ field: UNMAPPED_USER_FIELD, value: "cus_x" }] })
    ).resolves.toBeNull();
    await expect(
      wrapped.findMany({ model: "user", where: [{ field: UNMAPPED_USER_FIELD, value: "cus_x" }] })
    ).resolves.toEqual([]);
  });
});

describe("the plugin that installs it", () => {
  it("hands Better Auth the wrapped adapter, so every later plugin gets it", () => {
    const base = adapter();
    const wrapped = customerLinkPlugin().init?.({ adapter: base } as never);

    expect((wrapped as { context: { adapter: unknown } }).context.adapter).not.toBe(base);
  });
});
