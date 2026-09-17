import { describe, expect, it } from "vitest";
import { DEV_OTP, signInCodeMail } from "./better-auth";

describe("signInCodeMail", () => {
  it("says the code and its lifetime in both bodies, and names the product in the subject", () => {
    const mail = signInCodeMail("12345", 5);
    expect(mail.subject).toMatch(/sign-in code/);
    expect(mail.text).toContain("12345");
    expect(mail.text).toContain("5 minutes");
    expect(mail.html).toContain("<strong>12345</strong>");
    expect(mail.html).toContain("5 minutes");
  });

  // A code is digits, but the template is the one place a value reaches markup and it must
  // not trust its caller: an angle bracket in never becomes a tag.
  it("escapes what reaches the HTML", () => {
    expect(signInCodeMail("<b>", 5).html).toContain("&lt;b&gt;");
    expect(signInCodeMail("<b>", 5).text).toContain("<b>");
  });
});

describe("DEV_OTP", () => {
  // The mock and the development server must accept one and the same code, or a screen
  // built against the mock fails on the first real sign-in.
  it("is the code the contract mock accepts", async () => {
    const { MOCK_OTP } = await import("@contracts/auth/sign-in-email-otp.mock");
    expect(DEV_OTP).toBe(MOCK_OTP);
  });
});
