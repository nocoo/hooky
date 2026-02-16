import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Since content.js relies on DOM and chrome APIs, we extract the
 * pure logic into a testable function and mock the browser environment.
 */

// Extracted pure logic for testing
function getPageContext(doc, win) {
  const meta = {};

  const metaDescription = doc.querySelector('meta[name="description"]');
  if (metaDescription) {
    meta.description = metaDescription.getAttribute("content") || "";
  }

  const ogTags = doc.querySelectorAll('meta[property^="og:"]');
  for (const tag of ogTags) {
    const property = tag.getAttribute("property");
    const content = tag.getAttribute("content");
    if (property && content) {
      meta[property] = content;
    }
  }

  return {
    page: {
      url: win.location.href,
      title: doc.title,
      selection: win.getSelection?.()?.toString() || "",
      meta,
    },
  };
}

describe("getPageContext", () => {
  function createMockDoc({ title = "", metaDesc = null, ogTags = [] } = {}) {
    const elements = new Map();

    const metaDescEl = metaDesc
      ? { getAttribute: (attr) => (attr === "content" ? metaDesc : null) }
      : null;

    const ogElements = ogTags.map(([prop, content]) => ({
      getAttribute: (attr) => {
        if (attr === "property") return prop;
        if (attr === "content") return content;
        return null;
      },
    }));

    return {
      title,
      querySelector: vi.fn((selector) => {
        if (selector === 'meta[name="description"]') return metaDescEl;
        return null;
      }),
      querySelectorAll: vi.fn((selector) => {
        if (selector === 'meta[property^="og:"]') return ogElements;
        return [];
      }),
    };
  }

  function createMockWin({ href = "", selection = "" } = {}) {
    return {
      location: { href },
      getSelection: vi.fn(() => ({ toString: () => selection })),
    };
  }

  it("should extract basic page info", () => {
    const doc = createMockDoc({ title: "Test Page" });
    const win = createMockWin({ href: "https://example.com" });

    const ctx = getPageContext(doc, win);
    expect(ctx.page.url).toBe("https://example.com");
    expect(ctx.page.title).toBe("Test Page");
    expect(ctx.page.selection).toBe("");
    expect(ctx.page.meta).toEqual({});
  });

  it("should extract selected text", () => {
    const doc = createMockDoc({ title: "Page" });
    const win = createMockWin({
      href: "https://x.com",
      selection: "selected text",
    });

    const ctx = getPageContext(doc, win);
    expect(ctx.page.selection).toBe("selected text");
  });

  it("should extract meta description", () => {
    const doc = createMockDoc({
      title: "Page",
      metaDesc: "A description",
    });
    const win = createMockWin({ href: "https://x.com" });

    const ctx = getPageContext(doc, win);
    expect(ctx.page.meta.description).toBe("A description");
  });

  it("should extract OG tags", () => {
    const doc = createMockDoc({
      title: "Page",
      ogTags: [
        ["og:title", "OG Title"],
        ["og:description", "OG Desc"],
        ["og:image", "https://img.com/pic.png"],
      ],
    });
    const win = createMockWin({ href: "https://x.com" });

    const ctx = getPageContext(doc, win);
    expect(ctx.page.meta["og:title"]).toBe("OG Title");
    expect(ctx.page.meta["og:description"]).toBe("OG Desc");
    expect(ctx.page.meta["og:image"]).toBe("https://img.com/pic.png");
  });

  it("should handle missing getSelection", () => {
    const doc = createMockDoc({ title: "Page" });
    const win = { location: { href: "https://x.com" }, getSelection: null };

    const ctx = getPageContext(doc, win);
    expect(ctx.page.selection).toBe("");
  });
});
