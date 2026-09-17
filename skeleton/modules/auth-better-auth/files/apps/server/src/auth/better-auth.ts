import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { customSession, emailOTP } from "better-auth/plugins";
import { COOKIE_PREFIX } from "@contracts/auth/cookies";
import { OTP_EXPIRY_MINUTES, OTP_LENGTH } from "@contracts/auth/credentials";
import type { NotificationClient } from "../common/ports/notification";
import type { Telemetry } from "../common/ports/telemetry";
import type { Db } from "../database/scope-extension";
import type { AuthConfig } from "./auth.config";
import type { AuthExtensions } from "./auth.extensions";
import { OTP_ALLOWED_ATTEMPTS, OTP_EXPIRY_SECONDS, otpRateLimit } from "./otp-protection";

/** Substituted by the scaffold; the one place this module names the product. */
const PRODUCT_NAME = "Acme Notes";

/**
 * The one code every development sign-in accepts — the same value the contract mocks
 * use (`shared/contracts/auth/sign-in-email-otp.mock.ts`), so a screen built against the
 * mock signs in the same way against a local server.
 */
export const DEV_OTP = "12345";

/** A day of session, refreshed at half-time; the cookie cache spares the database a read per probe. */
const SESSION_EXPIRES_IN = 60 * 60 * 24;
const SESSION_UPDATE_AGE = 60 * 60 * 12;
const COOKIE_CACHE_MAX_AGE = 5 * 60;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ESCAPES[char]);

/**
 * The sign-in code, as an email. Inline rather than a template from the `notifications`
 * module: this module sends through the port and must not depend on who provides it.
 * Text and HTML say the same thing; every value that reaches the markup is escaped.
 */
export function signInCodeMail(
  code: string,
  expiresInMinutes: number
): { subject: string; text: string; html: string } {
  const ignore = "If you did not ask for it, ignore this message.";
  return {
    subject: `Your ${PRODUCT_NAME} sign-in code`,
    text: `Your ${PRODUCT_NAME} sign-in code is ${code}. It expires in ${expiresInMinutes} minutes.\n\n${ignore}`,
    html:
      `<p>Your ${escapeHtml(PRODUCT_NAME)} sign-in code is <strong>${escapeHtml(code)}</strong>. ` +
      `It expires in ${expiresInMinutes} minutes.</p><p>${ignore}</p>`,
  };
}

export type AuthDeps = {
  /** the client `PRISMA` hands out — the base with the product's scope applied */
  prisma: Db;
  /** the notification port: the sign-in code leaves through it and nothing else */
  notifications: NotificationClient;
  telemetry: Telemetry;
  config: AuthConfig;
  /**
   * The `auth-extensions` port (`auth.extensions.ts`): the plugins another module adds and
   * the fields it puts on the session. The default provider supplies neither, and this
   * factory then builds exactly what it built before the port existed.
   */
  extensions: AuthExtensions;
};

/**
 * The Better Auth instance, built from what it is given.
 *
 * A factory rather than a module-level constant: nothing is constructed and no env is read
 * when this file is imported, so a spec can import a controller without a database or a
 * `.env`. `auth.module.ts` is the one caller.
 *
 * Delivery of the code is fired, not awaited: a mail provider is slow and occasionally
 * down, and the person waiting on "send me a code" must not wait on it. The code is
 * already stored when the send runs, so a failed send is a captured error and a
 * "send a new code" tap.
 */
export function createAuth(deps: AuthDeps) {
  const { prisma, notifications, telemetry, config, extensions } = deps;
  const { isDevelopment } = config;

  return betterAuth({
    appName: PRODUCT_NAME,
    baseURL: config.baseURL.origin,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    socialProviders: {
      ...(config.google ? { google: config.google } : {}),
      ...(config.apple ? { apple: config.apple } : {}),
    },
    rateLimit: otpRateLimit(),
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    // The Prisma adapter reads a session (or an account) and its user in one query; the
    // schema (`db/prisma/schema/auth.prisma`) declares the relations that makes possible.
    experimental: { joins: true },
    advanced: {
      // The database hands out the integer ids; Better Auth reads and writes them as
      // strings (`user-id.ts` is the seam back to a number).
      database: { generateId: "serial" },
      // Every cookie carries the product's prefix: the Expo client stores only cookies
      // named with it, and mock mode's session cookie is named through the same constant.
      cookiePrefix: COOKIE_PREFIX,
      // What the per-IP rate limiter buckets on — named so the choice is reviewable when
      // the ingress changes (`clientIpHeaders`).
      ipAddress: { ipAddressHeaders: config.ipAddressHeaders },
      ...(config.cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: config.cookieDomain } } : {}),
    },
    // The four models, column for column `db/prisma/schema/auth.prisma`: Better Auth's own
    // names on the left, the snake_case columns on the right.
    user: {
      modelName: "user",
      fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
      // `DELETE /api/account` goes through `auth.api.deleteUser`, which needs this switch.
      deleteUser: { enabled: true },
    },
    session: {
      modelName: "auth_session",
      expiresIn: SESSION_EXPIRES_IN,
      updateAge: SESSION_UPDATE_AGE,
      cookieCache: { enabled: true, maxAge: COOKIE_CACHE_MAX_AGE },
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    account: {
      modelName: "account",
      fields: {
        userId: "user_id",
        accountId: "account_id",
        providerId: "provider_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "verification",
      fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
    },
    plugins: [
      // Persists the session in the app's SecureStore and re-attaches it as a `Cookie`
      // header, because a React Native fetch has no cookie jar. Registered whether or not
      // the mobile surface is installed — one plugin list means one session shape, and a
      // web-only tree that later adds the surface changes no server code — which is why
      // `@better-auth/expo` is a root dependency and not only the mobile app's.
      expo(),
      emailOTP({
        otpLength: OTP_LENGTH,
        expiresIn: OTP_EXPIRY_SECONDS,
        allowedAttempts: OTP_ALLOWED_ATTEMPTS,
        generateOTP: () => (isDevelopment ? DEV_OTP : undefined),
        sendVerificationOTP: async ({ email, otp, type }) => {
          // Sign-in is the only door this product opens; the plugin's other two flows
          // (verify an address, reset a password) are never asked for.
          if (type !== "sign-in") return;
          if (isDevelopment) console.log(`[auth] (dev) sign-in code for ${email}: ${otp}`);
          notifications
            .sendEmail({ to: email, from: config.fromEmail, ...signInCodeMail(otp, OTP_EXPIRY_MINUTES) })
            .catch((error) => telemetry.captureError(error, { mechanism: "auth_sign_in_code_mail" }));
        },
      }),
      // A captcha, when the product wants one, sits here: `captcha()` from `better-auth/plugins`
      // over `OTP_ENDPOINTS`, with the Expo app exempted by its `expo-origin` header.
      //
      // Whatever claimed the `auth-extensions` port, in one slot: after this module's own
      // two, because `expo()` has to wrap the cookie handling every later plugin's
      // endpoints answer through and `emailOTP()` owns the door this product opens — a
      // claimant extends auth, it does not get to sit in front of it. Before
      // `customSession`, because a plugin that contributes to the session (Better Auth's
      // Stripe plugin, say) has to run before the plugin that freezes what the session is.
      // Empty by default, so an unclaimed port leaves this list exactly as it was.
      ...(extensions.plugins ?? []),
      // Last, because it replaces `/get-session` and every other plugin's contribution to
      // the session has to be in place before it runs. What rides on the session is
      // decided here, once, on the server, and both apps read it off the probe they
      // already make: a module that computes an entitlement (a plan, a role) returns it
      // from `sessionExtension` and widens `shared/contracts/auth/session.ts` to match.
      //
      // `user` and `session` are spread last on purpose: an extension adds to the payload
      // and can never rewrite who is signed in. The mock answers by the same rule
      // (`shared/contracts/auth/get-session.mock.ts`), so a screen reads one shape on both.
      customSession(async ({ user, session }) => ({
        ...(await extensions.sessionExtension?.({ user, session, db: prisma })),
        user,
        session,
      })),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
