/**
 * The product's cookie prefix — the server (`advanced.cookiePrefix`), the Expo client
 * (`expoClient({ cookiePrefix })`, which stores only `Set-Cookie` headers carrying it) and
 * mock mode all read it from here, so a second product on the same dev origin never reads
 * this one's session. Substituted by the scaffold from the manifest's `cookiePrefix`.
 */
export const COOKIE_PREFIX = "__COOKIE_PREFIX__";

/** Over https Better Auth prepends `__Secure-`, so a deployment sends `__Secure-__COOKIE_PREFIX__.session_token`. */
export const SESSION_COOKIE_NAME = `${COOKIE_PREFIX}.session_token`;
