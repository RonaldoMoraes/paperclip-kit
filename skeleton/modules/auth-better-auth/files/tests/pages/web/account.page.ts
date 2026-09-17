import type { Locator, Page } from "@playwright/test";
import { expect } from "../../fixtures/web";
import { webLocator } from "../../helpers/elements";
import { seedSession, seedSignedOut } from "../../helpers/session";
import { expectScreenTag } from "../../helpers/store";

/**
 * Sign-in (/account) — the email code and the providers. Locators from
 * elements/account.yaml; the session state is seeded through helpers/session.ts.
 */
export class AccountPage {
  constructor(private readonly page: Page) {}

  /** Signed out, at the sign-in screen — with a `?redirect=` when there is somewhere to be. */
  async openSignedOut(query = ""): Promise<void> {
    await seedSignedOut(this.page);
    await this.page.goto(`/account${query}`);
  }

  /** Signed in (the mock user), landing on sign-in as someone who has no business there. */
  async openSignedIn(query = ""): Promise<void> {
    await seedSession(this.page);
    await this.page.goto(`/account${query}`);
  }

  /** Signed out, aiming at a guarded route — the gate is what brings the person here. */
  async openGuardedSignedOut(path: string): Promise<void> {
    await seedSignedOut(this.page);
    await this.page.goto(path);
  }

  async expectReady(): Promise<void> {
    await expect(webLocator(this.page, "account_title")).toBeVisible();
    await expect(webLocator(this.page, "account_email_input")).toBeVisible();
    await expectScreenTag(this.page, "account");
  }

  /** The gate's redirect, with the way back on it. */
  async expectSentHereFrom(path: string): Promise<void> {
    await this.page.waitForURL((url) => url.pathname === "/account" && url.searchParams.get("redirect") === path);
    await this.expectReady();
  }

  async expectErrorVisible(): Promise<void> {
    await expect(webLocator(this.page, "account_error")).toBeVisible();
    await expectScreenTag(this.page, "account");
  }

  /* ── the email door ───────────────────────────────────────── */

  async submitEmail(email: string): Promise<void> {
    await webLocator(this.page, "account_email_input").fill(email);
    await webLocator(this.page, "account_email_submit").click();
  }

  async expectOtpStep(): Promise<void> {
    await expect(webLocator(this.page, "account_otp_input")).toBeVisible();
    await expectScreenTag(this.page, "account");
  }

  /** The address was refused where it was typed: the error is up and no code step opened. */
  async expectRefusedBeforeSending(): Promise<void> {
    await expect(webLocator(this.page, "account_error")).toBeVisible();
    // What makes this a claim about the screen rather than about the mock: the send handler
    // accepts any address, so a request that went out would have opened the code step.
    await expect(webLocator(this.page, "account_otp_input")).toBeHidden();
    await expect(webLocator(this.page, "account_email_input")).toBeVisible();
  }

  /** The code step opened and its resend is counting the wait down rather than taking a click. */
  async expectResendWaiting(): Promise<void> {
    await this.expectOtpStep();
    const resend = webLocator(this.page, "account_otp_resend");
    await expect(resend).toBeDisabled();
    await expect(resend).toContainText(/in \d+s/);
  }

  /** The refusal is up, the person is still on the field, and the send under it is counting the wait down. */
  async expectEmailSendWaiting(): Promise<void> {
    await expect(webLocator(this.page, "account_error")).toBeVisible();
    await expect(webLocator(this.page, "account_otp_input")).toBeHidden();
    const send = webLocator(this.page, "account_email_submit");
    await expect(send).toBeDisabled();
    await expect(send).toContainText(/in \d+s/);
  }

  async fillOtp(code: string): Promise<void> {
    await webLocator(this.page, "account_otp_input").fill(code);
  }

  async submitOtp(): Promise<void> {
    await webLocator(this.page, "account_otp_submit").click();
  }

  async changeEmail(): Promise<void> {
    await webLocator(this.page, "account_change_email").click();
  }

  /* ── the providers ────────────────────────────────────────── */

  async tapProvider(provider: "apple" | "google"): Promise<void> {
    await webLocator(this.page, `account_${provider}`).click();
  }

  /**
   * A provider takes the whole page away and lands it: a full document navigation, not a
   * client-side one, so the landing is waited on by its path before anything in the new
   * document is read — a screen-tag poll across that boundary loses its execution context.
   */
  async expectLandedOn(pathname: string): Promise<void> {
    await this.page.waitForURL((url) => url.pathname === pathname, { timeout: 10_000 });
  }

  /**
   * This module's own two Settings rows, on the screen.
   *
   * A relative claim on purpose: `settings_action_rows` counts what every installed module
   * contributes, so a total is only ever right for one tree. What this module can assert
   * is that the rows it ships are among them.
   */
  async expectOwnSettingsRows(): Promise<void> {
    await expect(webLocator(this.page, "account_settings_sign_out")).toBeVisible();
    await expect(webLocator(this.page, "account_settings_delete")).toBeVisible();
  }

  /* ── keyboard ─────────────────────────────────────────────── */

  /** Tab until the locator holds focus — the keyboard-only journey's one move. */
  async tabTo(target: Locator, limit = 30): Promise<void> {
    for (let presses = 0; presses < limit; presses += 1) {
      await this.page.keyboard.press("Tab");
      if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    }
    throw new Error(`Tab never reached the target within ${limit} presses`);
  }

  async tabToKey(key: string, limit = 30): Promise<void> {
    await this.tabTo(webLocator(this.page, key), limit);
  }

  async typeAndEnter(text: string): Promise<void> {
    await this.page.keyboard.type(text);
    await this.page.keyboard.press("Enter");
  }
}
