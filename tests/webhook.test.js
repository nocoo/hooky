import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeWebhook } from "../src/webhook.js";

describe("executeWebhook", () => {
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
    expect(result.error).toBe("Network error");
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
      body: JSON.stringify({}),
    });
  });
});
