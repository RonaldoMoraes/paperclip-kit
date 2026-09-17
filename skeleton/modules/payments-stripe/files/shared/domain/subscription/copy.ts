/**
 * The subscription feature's copy — every word the paywall, the checkout return and its
 * Settings row print, under keys read by path (`SUBSCRIPTION_COPY.paywall.title`).
 * PLACEHOLDER WORDING: the product replaces the values; the keys are the structure.
 *
 * Imported directly as `@domain/subscription/copy`: the `@domain/copy` barrel is base-owned
 * and a module never edits it. Inline marks (`*em*`) render through each app's `withMarks`.
 */
export const SUBSCRIPTION_COPY = {
  paywall: {
    title: "Everything in *__PRODUCT_NAME__*.",
    body: "One plan, everything in it. Cancel whenever you like — it takes one tap.",
    /** `{price}` is the product's own line for each plan; the kit ships the cadence only */
    plans: {
      monthly: { name: "Monthly", note: "Billed every month." },
      annual: { name: "Annual", note: "Billed once a year." },
    },
    trial: "Your first week is free. Nothing is charged until it ends.",
    submit: "Continue",
    failed: "We couldn't open checkout. Try again in a moment.",
    /** what someone whose plan is on record but unpaid reads instead of a second checkout */
    lapsedTitle: "Your plan needs attention.",
    lapsedBody: "The last payment didn't go through. Updating the card puts it back.",
    /** the same trouble, on a plan this app did not sell and cannot fix */
    lapsedElsewhereBody:
      "The last payment didn't go through. It was bought in a store, so the fix is there — open your subscriptions on the device you subscribed with.",
    manageBilling: "Manage billing",
  },
  checkoutReturn: {
    confirmedTitle: "You're *in.*",
    confirmedBody: "Your plan is active. Everything in it is open from here.",
    trialingTitle: "Your week *starts now.*",
    trialingBody: "Nothing is charged until it ends, and cancelling takes one tap.",
    continue: "Open the app",
    unconfirmedTitle: "We couldn't *confirm it.*",
    unconfirmedBody:
      "If you were charged, the plan is yours — it just hasn't reached us yet. Nothing is charged twice for trying again.",
    retry: "Try again",
  },
  /** The plan screen, behind the paywall: what is held, and the way to Stripe's own page. */
  plan: {
    title: "Your *plan*.",
    /** `{plan}` the plan name the server stored */
    on: "You're on the {plan} plan.",
    trialing: "You're on a free trial.",
    /** `{date}` when it renews */
    renews: "Renews on {date}.",
    /** `{date}` when it stops */
    ends: "Ends on {date}. You keep everything until then.",
    manageBilling: "Manage billing",
    manageNote: "The card, the invoices and cancelling all live on Stripe's own page.",
    /** shown instead of the button when the plan was bought somewhere this app cannot manage */
    elsewhere: "Manage it where you bought it.",
    elsewhereNote:
      "This plan was bought in a store, so the store holds the card and the cancel button. Open your subscriptions on the device you subscribed with.",
  },
  settings: {
    subscription: "Subscription",
  },
};
