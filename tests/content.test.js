// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { extractPageContext } from "../src/pagecontext.js";

describe("extractPageContext", () => {
  beforeEach(() => {
    document.title = "";
    document.head.innerHTML = "";
  });

  it("should extract basic page info", () => {
    document.title = "Test Page";
    const ctx = extractPageContext();
    expect(ctx.page.url).toBe(location.href);
    expect(ctx.page.title).toBe("Test Page");
    expect(ctx.page.selection).toBe("");
    expect(ctx.page.meta).toEqual({});
  });

  it("should extract selected text", () => {
    document.title = "Page";
    // jsdom's getSelection returns an empty selection by default
    const ctx = extractPageContext();
    expect(ctx.page.selection).toBe("");
  });

  it("should extract meta description", () => {
    document.title = "Page";
    const meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", "A description");
    document.head.appendChild(meta);

    const ctx = extractPageContext();
    expect(ctx.page.meta.description).toBe("A description");
  });

  it("should extract OG tags", () => {
    document.title = "Page";
    const tags = [
      ["og:title", "OG Title"],
      ["og:description", "OG Desc"],
      ["og:image", "https://img.com/pic.png"],
    ];

    for (const [prop, content] of tags) {
      const meta = document.createElement("meta");
      meta.setAttribute("property", prop);
      meta.setAttribute("content", content);
      document.head.appendChild(meta);
    }

    const ctx = extractPageContext();
    expect(ctx.page.meta["og:title"]).toBe("OG Title");
    expect(ctx.page.meta["og:description"]).toBe("OG Desc");
    expect(ctx.page.meta["og:image"]).toBe("https://img.com/pic.png");
  });

  it("should handle empty meta description content", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", "");
    document.head.appendChild(meta);

    const ctx = extractPageContext();
    expect(ctx.page.meta.description).toBe("");
  });

  it("should skip OG tags with missing property or content", () => {
    // OG tag with property but no content attribute
    const meta1 = document.createElement("meta");
    meta1.setAttribute("property", "og:title");
    document.head.appendChild(meta1);

    // OG tag with content but empty property (shouldn't match selector anyway)
    const meta2 = document.createElement("meta");
    meta2.setAttribute("property", "og:image");
    meta2.setAttribute("content", "https://img.com/pic.png");
    document.head.appendChild(meta2);

    const ctx = extractPageContext();
    // meta1 has no content attr so it gets null, should be skipped
    expect(ctx.page.meta["og:title"]).toBeUndefined();
    // meta2 has both property and content
    expect(ctx.page.meta["og:image"]).toBe("https://img.com/pic.png");
  });

  it("should handle page with no meta tags at all", () => {
    document.title = "Empty Page";
    const ctx = extractPageContext();
    expect(ctx.page.meta).toEqual({});
  });
});
