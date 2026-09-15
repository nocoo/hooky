import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readReceipt, RESPONSE_LIMIT, RESPONSE_TIMEOUT } from "../src/response.js";
import { executeWebhook } from "../src/webhook.js";
import { addFeedbackChrome } from "./chrome-mock.js";

const config = { id: "save", name: "Save", url: "https://example.com/capture", method: "POST", params: [] };
const enabled = { ...config, response: { enabled: true } };
beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { vi.useRealTimers(); });

describe("bounded optional response reading", () => {
  it("does not read or retain response bodies without explicit opt-in", async () => {
    const cancel = vi.fn().mockResolvedValue();
    fetch.mockResolvedValue({ ok: true, status: 200, body: { cancel } });
    expect(await executeWebhook(config, {})).toEqual({ ok: true, status: 200, state: "success" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(["application/json; charset=utf-8", "application/problem+json"])("reads small %s responses", async (type) => {
    fetch.mockResolvedValue(new Response('{"saved":true,"receipt":"r1"}', { status: 201, headers: { "Content-Type": type } }));
    expect(await executeWebhook(enabled, {})).toMatchObject({ ok: true, status: 201, receipt: { text: '{"saved":true,"receipt":"r1"}', format: "json" } });
  });

  it("keeps HTTP failures distinct from valid response contents", async () => {
    fetch.mockResolvedValue(new Response('{"message":"unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } }));
    expect(await executeWebhook(enabled, {})).toMatchObject({ ok: false, state: "failed", status: 401, receipt: { text: '{"message":"unauthorized"}' } });
  });

  it.each([null, ""])("handles empty bodies including HTTP 204: %s", async (body) => {
    const response = new Response(body, { status: body === null ? 204 : 200 });
    expect(await readReceipt(response)).toMatchObject({ text: "", note: "responseEmpty" });
  });

  it("treats a missing content type as plain text and never interprets HTML", async () => {
    const response = new Response("<script>danger()</script>");
    response.headers.delete("Content-Type");
    expect(await readReceipt(response)).toEqual({ text: "<script>danger()</script>", format: "text" });
  });

  it("refuses binary responses without consuming them", async () => {
    const cancel = vi.fn().mockRejectedValue(new Error("already closed"));
    const response = { headers: new Headers({ "Content-Type": "image/png" }), body: { cancel } };
    expect(await readReceipt(response)).toEqual({ note: "responseUnsupported" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("retains malformed JSON as plain text without losing the HTTP outcome", async () => {
    fetch.mockResolvedValue(new Response('{"unfinished":', { headers: { "Content-Type": "application/json" } }));
    expect(await executeWebhook(enabled, {})).toMatchObject({ ok: true, status: 200, receipt: { note: "responseInvalidJson", text: '{"unfinished":' } });
  });

  it("enforces the limit in bytes while streaming and cancels the rest", async () => {
    const cancel = vi.fn();
    const bytes = new TextEncoder().encode("中文".repeat(5000));
    const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes); }, cancel });
    const result = await readReceipt(new Response(stream, { headers: { "Content-Type": "text/plain" } }));
    expect(result.note).toBe("responseTruncated");
    expect(result.text.length).toBeLessThan(RESPONSE_LIMIT);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("handles many chunks without retaining more than the limit", async () => {
    const stream = new ReadableStream({ start(controller) {
      for (let i = 0; i < 20; i++) controller.enqueue(new Uint8Array(1024).fill(65));
      controller.close();
    } });
    const result = await readReceipt(new Response(stream));
    expect(result.text).toBe("A".repeat(RESPONSE_LIMIT));
    expect(result.note).toBe("responseTruncated");
  });

  it("retains HTTP success when the stream fails or cannot be opened", async () => {
    const stream = new ReadableStream({ start(controller) { controller.error(new Error("disconnected")); } });
    fetch.mockResolvedValueOnce(new Response(stream));
    expect(await executeWebhook(enabled, {})).toMatchObject({ state: "success", status: 200, receipt: { note: "responseUnavailable" } });
    fetch.mockResolvedValueOnce({ ok: true, status: 201, headers: new Headers(), body: { getReader() { throw new Error("locked"); } } });
    expect(await executeWebhook(enabled, {})).toMatchObject({ state: "success", status: 201, receipt: { note: "responseUnavailable" } });
  });

  it("stops a slow body after three seconds without waiting for cancel or retrying", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise(() => {}));
    fetch.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("partial")); }, cancel })));
    const task = executeWebhook(enabled, {});
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT);
    expect(await task).toMatchObject({ ok: true, status: 200, receipt: { text: "partial", note: "responseUnavailable" } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps opted-in receipts in session storage but never sends them into the page", async () => {
    vi.resetModules();
    global.chrome = {};
    const session = addFeedbackChrome(chrome);
    const { sendWebhook } = await import("../src/send.js");
    fetch.mockResolvedValue(new Response("private receipt", { status: 202 }));
    const result = await sendWebhook(enabled, {}, { source: "context", tab: { id: 1, url: "https://example.com" } });
    expect(session.hookyLastResult.receipt.text).toBe("private receipt");
    expect(result.status).toBe(202);
    expect(JSON.stringify(chrome.scripting.executeScript.mock.calls)).not.toContain("private receipt");
  });
});
