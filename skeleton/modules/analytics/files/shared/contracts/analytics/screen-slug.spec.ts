import { describe, expect, it } from "vitest";
import { slug } from "./events";
import { screenSlug } from "./screen-slug";

describe("screenSlug", () => {
  // The same screen, named the same way from the two routers' own words.
  it("names the web pattern and the mobile segments identically", () => {
    expect(screenSlug(["/example/$id"])).toBe("example-id");
    expect(screenSlug(["(app)", "example", "[id]"])).toBe("example-id");
    expect(screenSlug(["/example/"])).toBe("example");
    expect(screenSlug(["(app)", "(tabs)", "example"])).toBe("example");
    expect(screenSlug(["/settings"])).toBe(screenSlug(["(app)", "(tabs)", "settings"]));
  });

  it("drops groups and pathless layouts, keeps a parameter's placeholder", () => {
    expect(screenSlug(["/_app/example/$id"])).toBe("example-id");
    expect(screenSlug(["(app)", "docs", "[...rest]"])).toBe("docs-rest");
    expect(screenSlug(["+not-found"])).toBe("not-found");
  });

  it("names the empty path root and never exceeds the slug's bound", () => {
    expect(screenSlug([])).toBe("root");
    expect(screenSlug(["/"])).toBe("root");
    const long = screenSlug([`/${"segment/".repeat(20)}`]);
    expect(long.length).toBeLessThanOrEqual(64);
    expect(() => slug.parse(long)).not.toThrow();
  });

  it("always answers a slug, whatever the router hands it", () => {
    for (const segments of [["/Example/$Id"], ["/x_y/(group)/z.tsx"], ["--", "a__b"], ["/api/v2/items"]]) {
      expect(() => slug.parse(screenSlug(segments))).not.toThrow();
    }
    expect(screenSlug(["/Example/$Id"])).toBe("example-id");
  });
});
