import { signInCode } from "./sign-in-code";
import type { RenderedTemplate, Template } from "./template";

/** Every message the product sends, by name. A new template is one file and one line here. */
const templates = {
  "sign-in-code": signInCode,
};

export type TemplateName = keyof typeof templates;
export type TemplateParams<Name extends TemplateName> = Parameters<(typeof templates)[Name]>[0];

/**
 * `renderTemplate("sign-in-code", { code })` → `{ subject, text, html }`, typed by name so a
 * missing or misspelled parameter fails to compile, and HTML-escaped by the template so a
 * value never reaches the markup raw. The caller hands the result to `sendEmail`.
 */
export function renderTemplate<Name extends TemplateName>(name: Name, params: TemplateParams<Name>): RenderedTemplate {
  const template: Template<TemplateParams<Name>> = templates[name];
  return template(params);
}

export { type RenderedTemplate, type Template, escapeHtml } from "./template";
