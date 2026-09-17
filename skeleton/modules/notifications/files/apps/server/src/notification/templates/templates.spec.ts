import { describe, expect, it } from "vitest";
import { escapeHtml, renderTemplate } from "./index";

describe("renderTemplate", () => {
  it("renders the sign-in code into a subject, a text body and an HTML body", () => {
    const rendered = renderTemplate("sign-in-code", { code: "123456" });

    expect(rendered.subject).toMatch(/sign-in code/);
    expect(rendered.text).toContain("123456");
    expect(rendered.html).toContain("<strong>123456</strong>");
    expect(rendered.text).not.toContain("expires");
  });

  it("states the expiry when the sender knows it", () => {
    const rendered = renderTemplate("sign-in-code", { code: "123456", expiresInMinutes: 10 });

    expect(rendered.text).toContain("It expires in 10 minutes.");
    expect(rendered.html).toContain("It expires in 10 minutes.");
  });

  it("escapes a value before it reaches the HTML body, and leaves the text body alone", () => {
    const rendered = renderTemplate("sign-in-code", { code: "<script>alert(1)</script>" });

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered.text).toContain("<script>alert(1)</script>");
  });
});

describe("escapeHtml", () => {
  it("escapes the five characters that can open markup or leave an attribute", () => {
    expect(escapeHtml(`a & b < c > "d" 'e'`)).toBe("a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;");
  });
});
