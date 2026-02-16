import { describe, it, expect } from "vitest";
import { resolveTemplate } from "../src/template.js";

describe("resolveTemplate", () => {
  const context = {
    page: {
      url: "https://example.com/path?q=1",
      title: "Example Page",
      selection: "selected text here",
      meta: {
        description: "A sample page",
        "og:title": "OG Title",
        "og:description": "OG Description",
        "og:image": "https://example.com/image.png",
      },
    },
  };

  it("should return plain text as-is", () => {
    expect(resolveTemplate("hello world", context)).toBe("hello world");
  });

  it("should return empty string for empty input", () => {
    expect(resolveTemplate("", context)).toBe("");
  });

  it("should resolve {{page.url}}", () => {
    expect(resolveTemplate("{{page.url}}", context)).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("should resolve {{page.title}}", () => {
    expect(resolveTemplate("{{page.title}}", context)).toBe("Example Page");
  });

  it("should resolve {{page.selection}}", () => {
    expect(resolveTemplate("{{page.selection}}", context)).toBe(
      "selected text here",
    );
  });

  it("should resolve {{page.meta.description}}", () => {
    expect(resolveTemplate("{{page.meta.description}}", context)).toBe(
      "A sample page",
    );
  });

  it("should resolve {{page.meta.og:title}}", () => {
    expect(resolveTemplate("{{page.meta.og:title}}", context)).toBe(
      "OG Title",
    );
  });

  it("should resolve {{page.meta.og:image}}", () => {
    expect(resolveTemplate("{{page.meta.og:image}}", context)).toBe(
      "https://example.com/image.png",
    );
  });

  it("should resolve multiple variables in one string", () => {
    expect(
      resolveTemplate("{{page.title}} - {{page.url}}", context),
    ).toBe("Example Page - https://example.com/path?q=1");
  });

  it("should mix static text with variables", () => {
    expect(
      resolveTemplate("Visit {{page.url}} now!", context),
    ).toBe("Visit https://example.com/path?q=1 now!");
  });

  it("should resolve unknown variable to empty string", () => {
    expect(resolveTemplate("{{page.unknown}}", context)).toBe("");
  });

  it("should resolve deeply unknown path to empty string", () => {
    expect(resolveTemplate("{{page.meta.nonexistent}}", context)).toBe("");
  });

  it("should handle whitespace inside braces", () => {
    expect(resolveTemplate("{{ page.url }}", context)).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("should leave malformed templates as-is", () => {
    expect(resolveTemplate("{{page.url}", context)).toBe("{{page.url}");
    expect(resolveTemplate("{page.url}}", context)).toBe("{page.url}}");
  });

  it("should handle empty context gracefully", () => {
    expect(resolveTemplate("{{page.url}}", {})).toBe("");
  });

  it("should handle null/undefined selection", () => {
    const ctx = {
      page: { url: "https://x.com", title: "X", selection: "", meta: {} },
    };
    expect(resolveTemplate("{{page.selection}}", ctx)).toBe("");
  });
});
