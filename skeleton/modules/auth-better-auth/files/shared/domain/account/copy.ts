/**
 * The account feature's copy — every word its sign-in screen and its Settings rows print,
 * under keys both platforms read by path (`ACCOUNT_COPY.code.title`). PLACEHOLDER WORDING:
 * the product replaces the values; the keys are what web and mobile share.
 *
 * Imported directly as `@domain/account/copy`: the `@domain/copy` barrel is base-owned and
 * a module never edits it. Inline marks (`*em*`) render through each app's `withMarks`.
 */
export const ACCOUNT_COPY = {
  method: {
    title: "Sign in to *__PRODUCT_NAME__*.",
    body: "One code by email, or a provider you already use. No password to make up.",
    providers: {
      apple: "Continue with Apple",
      google: "Continue with Google",
    },
    or: "or",
    emailLabel: "Email",
    emailPlaceholder: "you@anywhere.com",
    send: "Continue with email",
    hint: "We'll email you a sign-in code. Nothing to remember.",
  },
  code: {
    title: "Check your *email*.",
    /** `{n}` the code's length, `{email}` where it went, `{minutes}` how long it lives */
    body: "We sent a {n}-digit code to {email}. It's good for {minutes} minutes.",
    label: "Code",
    verify: "Verify and continue",
    resend: "Send a new code",
    changeEmail: "Use a different email",
  },
  /** what the screen says when a provider sent the person back without a session */
  socialFailed: "Sign-in didn't complete. Try again, or use email.",
  settings: {
    signOut: "Sign out",
    deleteAccount: "Delete my account",
    deleteConfirmTitle: "Delete your account?",
    deleteConfirm: "Everything kept here goes with it.",
    cancel: "Cancel",
    confirmDelete: "Delete",
  },
};
