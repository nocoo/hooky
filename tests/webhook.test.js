import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeWebhook, buildHeaders, previewRequest } from "../src/webhook.js";

describe("executeWebhook", () => {
  it("rejects unsupported methods before making a request", async () => {
    const result = await executeWebhook({ url: "https://example.com", method: "TRACE", params: [] }, {});
    expect(result).toEqual({ ok: false, state: "failed", error: "invalidMethod" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  const context = {
    page: {
      url: "https://example.com",
      title: "Example",
      selection: "",
      meta: {},
    },
  };

  it("should send POST request with JSON body", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [
        { key: "url", value: "{{page.url}}" },
        { key: "tag", value: "test" },
      ],
    };

    const result = await executeWebhook(config, context);

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({ url: "https://example.com", tag: "test" }),
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("should send GET request with query params and no body", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const config = {
      url: "https://api.example.com/hook",
      method: "GET",
      params: [{ key: "url", value: "{{page.url}}" }],
    };

    const result = await executeWebhook(config, context);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/hook?url=https%3A%2F%2Fexample.com",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(result.ok).toBe(true);
  });

  it("should send PUT request with JSON body", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const config = {
      url: "https://api.example.com/hook",
      method: "PUT",
      params: [{ key: "data", value: "value" }],
    };

    await executeWebhook(config, context);

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({ data: "value" }),
    });
  });

  it("should send PATCH request with JSON body", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const config = {
      url: "https://api.example.com/hook",
      method: "PATCH",
      params: [{ key: "field", value: "updated" }],
    };

    await executeWebhook(config, context);

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({ field: "updated" }),
    });
  });

  it("should send DELETE request with query params", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });

    const config = {
      url: "https://api.example.com/hook",
      method: "DELETE",
      params: [{ key: "id", value: "123" }],
    };

    const result = await executeWebhook(config, context);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/hook?id=123",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(result.status).toBe(204);
  });

  it("should handle fetch failure", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));

    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [],
    };

    const result = await executeWebhook(config, context);

    expect(result.ok).toBe(false);
    expect(result.state).toBe("unknown");
    expect(result.error).toBe("requestUnconfirmed");
  });

  it("should handle non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [],
    };

    const result = await executeWebhook(config, context);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  it("should send request with empty params", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [],
    };

    await executeWebhook(config, context);

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({}),
    });
  });
});

describe("template request headers", () => {
  const config = { url: "https://example.com/hook", method: "POST", params: [] };

  it("resolves authentication and ID headers once, and refuses to forward secrets on redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock;
    const headers = [
      { key: " Authorization ", value: "Bearer secret" },
      { key: "X-API-Key", value: "{{page.selection}}" },
      { key: "Idempotency-Key", value: "{{ send.id }}" },
      { key: "", value: "" },
    ];
    await executeWebhook({ ...config, headers }, { page: { selection: "literal {{send.id}}" }, send: { id: "capture-1" } });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: {
      "Content-Type": "application/json", authorization: "Bearer secret", "x-api-key": "literal {{send.id}}", "idempotency-key": "capture-1",
    } });
    const preview = previewRequest({ ...config, headers }, { page: { selection: "secret" }, send: { id: "capture-1" } });
    expect(preview).toContain("authorization: ••••");
    expect(preview).toContain("x-api-key: ••••");
    expect(preview).not.toMatch(/secret|capture-1/);
  });

  it.each(["Content-Type", "Cookie", "Host", "Origin", "Sec-Fetch-Site", "Proxy-Authorization", "Content-Length"])("rejects browser-managed header %s", (key) => {
    expect(() => buildHeaders([{ key, value: "override" }])).toThrow("managedHeader");
  });

  it.each(["X-HTTP-Method", "X-HTTP-Method-Override", "X-Method-Override"])("validates method-override values for %s", (key) => {
    expect(() => buildHeaders([{ key, value: "GET, TRACE" }])).toThrow("managedHeader");
    expect(buildHeaders([{ key, value: "PUT" }])[key.toLowerCase()]).toBe("PUT");
  });

  it.each([
    [{ key: "", value: "secret" }],
    [{ key: "invalid name", value: "secret" }],
    [{ key: "X-Key", value: "first\nsecond" }],
    [{ key: "X-Key", value: "first\rsecond" }],
    [{ key: "X-Key", value: "中文" }],
  ])("rejects invalid names and values without leaking credentials", (header) => {
    expect(() => buildHeaders([header])).toThrow("invalidHeader");
  });

  it("rejects duplicate names case-insensitively and safely keeps unusual valid names", () => {
    expect(() => buildHeaders([{ key: "X-Key", value: "one" }, { key: "x-KEY", value: "two" }])).toThrow("duplicateHeader");
    const headers = buildHeaders([{ key: "__proto__", value: "safe" }]);
    expect(Object.hasOwn(headers, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(headers)).toBe(Object.prototype);
  });

  it("previews query requests without a body and keeps old templates unchanged", () => {
    expect(buildHeaders()).toEqual({ "Content-Type": "application/json" });
    const preview = previewRequest({ ...config, method: "GET", params: [{ key: "q", value: "{{page.title}}" }] }, { page: { title: "A B" } });
    expect(preview).toBe("GET https://example.com/hook?q=A%20B\nContent-Type: application/json");
  });
});
