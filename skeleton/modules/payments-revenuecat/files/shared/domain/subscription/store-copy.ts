/**
 * The words the phone's paywall and its Settings rows print, under keys read by path
 * (`STORE_COPY.paywall.title`). PLACEHOLDER WORDING: the product replaces the values; the
 * keys are the structure.
 *
 * A file of its own beside `copy.ts`, which is `payments-stripe`'s: a module never edits
 * another's file, and the two say different things anyway. The web sells a checkout the
 * server prices; the phone sells whatever the store is serving, at whatever the store says
 * it costs, and every line here is about that difference — the price comes from the
 * offering, cancelling happens on the store's own page, and a receipt already on the device
 * is restored rather than bought again.
 *
 * Imported directly as `@domain/subscription/store-copy`: the `@domain/copy` barrel is
 * base-owned. Inline marks (`*em*`) render through the app's `withMarks`.
 */
export const STORE_COPY = {
  paywall: {
    title: "Everything in *__PRODUCT_NAME__*.",
    body: "One plan, everything in it. Cancel any time from your store account.",
    /** `{price}` is what the store quotes for the plan, in the person's own currency */
    price: "{price}",
    plans: {
      monthly: { name: "Monthly", note: "Billed every month." },
      annual: { name: "Annual", note: "Billed once a year." },
    },
    /** shown when the offering's products carry a free introductory period */
    trial: "Your first week is free. Nothing is charged until it ends.",
    submit: "Continue",
    restore: "Restore purchases",
    /** the store answered with no offering, or did not answer at all */
    unavailableTitle: "The store isn't answering.",
    unavailableBody: "Plans come from the App Store and Google Play. Check the connection and try again.",
    retry: "Try again",
    terms: "Terms",
    privacy: "Privacy",
    legal: "Payment is taken by the store. A subscription renews until it is cancelled from your store account.",
  },
  errors: {
    storeUnavailable: "We couldn't reach the store. Try again in a moment.",
    purchaseFailed: "That purchase didn't go through. Nothing was charged.",
    /** the store took the money and the server cannot see it yet — said out loud, never swallowed */
    confirmFailed: "The store took the payment but we couldn't confirm it yet. Try Restore purchases in a moment.",
    restoreNothing: "There's no purchase on this store account to restore.",
    manageFailed: "Couldn't open the store. Manage the subscription from your store account's settings.",
  },
  settings: {
    manage: "Manage subscription",
    restore: "Restore purchases",
  },
};

/** Where the terms and the privacy policy live. A store review reads both from the paywall. */
export const STORE_LEGAL_URLS = {
  terms: "https://__DOMAIN__/terms",
  privacy: "https://__DOMAIN__/privacy",
} as const;
