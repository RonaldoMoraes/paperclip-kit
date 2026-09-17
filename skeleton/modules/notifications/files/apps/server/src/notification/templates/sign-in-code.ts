import { type Template, escapeHtml } from "./template";

/** Substituted by the scaffold; the one place this module names the product. */
const PRODUCT_NAME = "__PRODUCT_NAME__";

export type SignInCodeParams = {
  code: string;
  /** stated in the message when the sender knows it */
  expiresInMinutes?: number;
};

/** The one-time code a sign-in sends. Text and HTML say the same thing; HTML is escaped. */
export const signInCode: Template<SignInCodeParams> = ({ code, expiresInMinutes }) => {
  const expiry = expiresInMinutes === undefined ? "" : ` It expires in ${expiresInMinutes} minutes.`;
  const ignore = "If you did not ask for it, ignore this message.";
  return {
    subject: `Your ${PRODUCT_NAME} sign-in code`,
    text: `Your ${PRODUCT_NAME} sign-in code is ${code}.${expiry}\n\n${ignore}`,
    html:
      `<p>Your ${escapeHtml(PRODUCT_NAME)} sign-in code is <strong>${escapeHtml(code)}</strong>.${expiry}</p>` +
      `<p>${ignore}</p>`,
  };
};
