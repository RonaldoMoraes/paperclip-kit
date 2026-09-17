import { clientIpHeaders } from "./otp-protection";

/** Long enough that a guessed secret is not a session; Better Auth signs cookies with it. */
const SECRET_MIN_LENGTH = 32;

export type SocialCredentials = { clientId: string; clientSecret: string };

export type AuthConfig = {
  /** The origin every Better Auth URL is built from — the one the browser uses. */
  baseURL: URL;
  secret: string;
  /** Development takes the fixed sign-in code and trusts Expo Go's `exp://` origin. */
  isDevelopment: boolean;
  /** The Expo app's deep-link schemes, one per installed variant (`EXPO_PUBLIC_SCHEME` on each). */
  mobileSchemes: string[];
  trustedOrigins: string[];
  google: SocialCredentials | null;
  apple: SocialCredentials | null;
  /** Set only over https, where a cookie can span subdomains. */
  cookieDomain: string | null;
  /** What the per-IP rate limiter buckets on — one header, never a list. */
  ipAddressHeaders: string[];
  /** The sender of the sign-in code, handed to the notification port. */
  fromEmail: string;
};

/**
 * One per installed variant, and all three by default: no deploy has to set `MOBILE_SCHEME`,
 * and a scheme missing here is an app whose `<scheme>://` origin is refused. They mirror
 * `EXPO_PUBLIC_SCHEME` in `apps/mobile/.env.example`.
 */
const DEFAULT_MOBILE_SCHEMES = ["__SCHEME__", "__SCHEME__-preview", "__SCHEME__-dev"];

/** Substituted by the scaffold; overridden by `AUTH_FROM_EMAIL`. */
const DEFAULT_FROM_EMAIL = "__AUTH_FROM_EMAIL__";

type Env = Record<string, string | undefined>;

const csv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`[auth] ${name} is missing. Set it in .env — see .env.example.`);
  return value;
}

function parseBaseURL(env: Env): URL {
  const raw = required(env, "BETTER_AUTH_URL");
  try {
    return new URL(raw);
  } catch {
    throw new Error(`[auth] BETTER_AUTH_URL is not a valid URL: ${raw}`);
  }
}

function readSecret(env: Env): string {
  const secret = required(env, "BETTER_AUTH_SECRET");
  if (secret.length < SECRET_MIN_LENGTH) {
    throw new Error(
      `[auth] BETTER_AUTH_SECRET must be at least ${SECRET_MIN_LENGTH} characters. Generate one: openssl rand -base64 32`
    );
  }
  return secret;
}

function socialCredentials(id: string | undefined, secret: string | undefined): SocialCredentials | null {
  const clientId = id?.trim();
  const clientSecret = secret?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * The only reader of `process.env` for the Better Auth instance, and the boot it fails.
 *
 * A missing URL or a short secret is a configuration error the deploy must see, not
 * something a person discovers at the sign-in screen. A social provider with only half
 * its pair is not configured at all — half a pair would register a provider whose every
 * sign-in fails.
 *
 * The Expo app has no browser origin: its requests arrive as `<scheme>://`, and Expo Go
 * serves the app from `exp://<lan-ip>:8081`, which is why `exp://` is trusted in
 * development only. Apple's own origin is trusted because its sign-in posts back from it.
 */
export function loadAuthConfig(env: Env): AuthConfig {
  const baseURL = parseBaseURL(env);
  const isDevelopment = env.NODE_ENV === "development";
  const configured = csv(env.MOBILE_SCHEME);
  const mobileSchemes = configured.length > 0 ? configured : DEFAULT_MOBILE_SCHEMES;
  const cookieDomain = env.COOKIE_DOMAIN?.trim();

  return {
    baseURL,
    secret: readSecret(env),
    isDevelopment,
    mobileSchemes,
    trustedOrigins: [
      baseURL.origin,
      "https://appleid.apple.com",
      ...mobileSchemes.map((scheme) => `${scheme}://`),
      ...(isDevelopment ? ["exp://"] : []),
      ...csv(env.AUTH_TRUSTED_ORIGINS),
    ],
    google: socialCredentials(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    apple: socialCredentials(env.APPLE_CLIENT_ID, env.APPLE_CLIENT_SECRET),
    cookieDomain: baseURL.protocol === "https:" && cookieDomain ? cookieDomain : null,
    ipAddressHeaders: clientIpHeaders(env),
    fromEmail: env.AUTH_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
  };
}
