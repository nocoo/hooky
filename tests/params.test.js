import { describe, it, expect } from "vitest";
import { buildRequestBody, buildRequestUrl } from "../src/params.js";

describe("buildRequestBody", () => {
  const context = {
    page: {
      url: "https://example.com",
      title: "Example",
      selection: "hello",
      meta: { description: "desc" },
    },
  };

  it("should build JSON body from key-value params", () => {
    const params = [
      { key: "url", value: "{{page.url}}" },
      { key: "note", value: "static text" },
    ];
    const result = buildRequestBody(params, context);
    expect(result).toEqual({
      url: "https://example.com",
      note: "static text",
    });
  });

  it("should handle empty params array", () => {
    expect(buildRequestBody([], context)).toEqual({});
  });

  it("should skip params with empty key", () => {
    const params = [
      { key: "", value: "val" },
      { key: "valid", value: "ok" },
    ];
    expect(buildRequestBody(params, context)).toEqual({ valid: "ok" });
  });

  it("should resolve multiple template variables in one value", () => {
    const params = [
      { key: "info", value: "{{page.title}} - {{page.url}}" },
    ];
    expect(buildRequestBody(params, context)).toEqual({
      info: "Example - https://example.com",
    });
  });

  it("should handle undefined context values gracefully", () => {
    const params = [{ key: "missing", value: "{{page.nonexistent}}" }];
    expect(buildRequestBody(params, context)).toEqual({ missing: "" });
  });
});

describe("buildRequestUrl", () => {
  const context = {
    page: {
      url: "https://example.com",
      title: "Example",
      selection: "",
      meta: {},
    },
  };

  it("should return base URL for non-GET methods", () => {
    const url = buildRequestUrl(
      "https://api.example.com/hook",
      [],
      context,
      "POST",
    );
    expect(url).toBe("https://api.example.com/hook");
  });

  it("should append params as query string for GET method", () => {
    const params = [
      { key: "url", value: "{{page.url}}" },
      { key: "tag", value: "test" },
    ];
    const url = buildRequestUrl(
      "https://api.example.com/hook",
      params,
      context,
      "GET",
    );
    expect(url).toBe(
      "https://api.example.com/hook?url=https%3A%2F%2Fexample.com&tag=test",
    );
  });

  it("should handle GET with no params", () => {
    const url = buildRequestUrl(
      "https://api.example.com/hook",
      [],
      context,
      "GET",
    );
    expect(url).toBe("https://api.example.com/hook");
  });

  it("should append to existing query string", () => {
    const params = [{ key: "extra", value: "val" }];
    const url = buildRequestUrl(
      "https://api.example.com/hook?existing=1",
      params,
      context,
      "GET",
    );
    expect(url).toBe(
      "https://api.example.com/hook?existing=1&extra=val",
    );
  });

  it("should skip params with empty key for GET", () => {
    const params = [
      { key: "", value: "skip" },
      { key: "keep", value: "yes" },
    ];
    const url = buildRequestUrl(
      "https://api.example.com/hook",
      params,
      context,
      "GET",
    );
    expect(url).toBe("https://api.example.com/hook?keep=yes");
  });

  it("should handle DELETE like GET (no body, params as query)", () => {
    const params = [{ key: "id", value: "123" }];
    const url = buildRequestUrl(
      "https://api.example.com/hook",
      params,
      context,
      "DELETE",
    );
    expect(url).toBe("https://api.example.com/hook?id=123");
  });
});
