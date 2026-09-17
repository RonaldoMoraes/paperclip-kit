/** What a template renders: the three parts an email carries, ready for `sendEmail`. */
export type RenderedTemplate = { subject: string; text: string; html: string };

export type Template<Params> = (params: Params) => RenderedTemplate;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Every value that reaches HTML goes through here — a code, a name, a link label. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}
