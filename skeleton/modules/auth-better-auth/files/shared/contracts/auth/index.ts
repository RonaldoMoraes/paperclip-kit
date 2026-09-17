import { handlers as getSession } from "./get-session.mock";
import { handlers as sendVerificationOtp } from "./send-verification-otp.mock";
import { handlers as signInEmailOtp } from "./sign-in-email-otp.mock";
import { handlers as signInSocial } from "./sign-in-social.mock";
import { handlers as signOut } from "./sign-out.mock";

/**
 * Every mock this module's auth routes own. The account feature's two endpoints are the
 * module's second `contracts.handlers` entry (`../account`), listed beside this one in
 * `module.json`: `mocks.gen.ts` aliases a symbol per import path, so one module may bring
 * `handlers` from two of its own files. A new endpoint here is a new `<endpoint>.mock.ts`
 * and one line below.
 */
export const handlers = [...getSession, ...sendVerificationOtp, ...signInEmailOtp, ...signInSocial, ...signOut];
