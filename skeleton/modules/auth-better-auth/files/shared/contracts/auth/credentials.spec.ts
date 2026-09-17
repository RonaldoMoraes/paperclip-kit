import { describe, expect, it } from "vitest";
import { EmailAddress, OTP_LENGTH, VerificationCode } from "./credentials";

const complaint = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : (result.error?.issues[0]?.message ?? null);

describe("EmailAddress", () => {
  it("names an empty field as empty rather than as a malformed address", () => {
    expect(complaint(EmailAddress.safeParse(""))).toBe("Enter your email first.");
    expect(complaint(EmailAddress.safeParse("   "))).toBe("Enter your email first.");
  });

  it("refuses something that is not an address", () => {
    expect(complaint(EmailAddress.safeParse("someone"))).toBe("That doesn't look like an email address.");
  });

  it("accepts a pasted address and hands back the trimmed one", () => {
    const parsed = EmailAddress.safeParse("  someone@example.com  ");
    expect(parsed.success && parsed.data).toBe("someone@example.com");
  });
});

describe("VerificationCode", () => {
  it("refuses a code that is not yet whole, or not digits", () => {
    expect(complaint(VerificationCode.safeParse("12"))).toBe("Enter the full code from the email.");
    expect(complaint(VerificationCode.safeParse("1234a"))).toBe("Enter the full code from the email.");
  });

  it("accepts the code the server issues", () => {
    expect(VerificationCode.safeParse("1".repeat(OTP_LENGTH)).success).toBe(true);
  });
});
