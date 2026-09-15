import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readReceipt, RESPONSE_LIMIT, RESPONSE_TIMEOUT, validateResponseConfig } from "../src/response.js";
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

describe("optional response fields and business rules", () => {
  const withRule = (overrides = {}) => ({ ...enabled, response: { enabled: true, messagePath: "data.message", receiptPath: "data.id", successPath: "saved", successValue: "true", ...overrides } });
  const respond = (body, status = 200) => fetch.mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("extracts scalar receipts without interpreting HTML and confirms the explicit business condition", async () => {
    respond({ saved: true, data: { id: 123, message: '<b onclick="attack()">Saved</b>' } });
    const result = await executeWebhook(withRule(), {});
    expect(result).toMatchObject({ ok: true, httpOk: true, business: "matched", status: 200, receipt: { receiptId: "123", message: '<b onclick="attack()">Saved</b>' } });
    global.chrome = {};
    addFeedbackChrome(chrome);
    const { resultMessage } = await import("../src/feedback.js");
    expect(resultMessage(result)).toContain("business success rule");
    expect(resultMessage(result)).not.toContain("attack");
  });

  it.each([
    [false, "true", "rejected"], ["true", "true", "rejected"], [1, '"1"', "rejected"],
    [true, "true", "matched"], ["ok", '"ok"', "matched"], [1, "1", "matched"], [null, "null", "matched"],
  ])("matches the type and value exactly: %s against %s", async (actual, expected, business) => {
    respond({ saved: actual });
    const result = await executeWebhook(withRule({ successValue: expected }), {});
    expect(result.business).toBe(business);
    expect(result.status).toBe(200);
    expect(result.httpOk).toBe(true);
    expect(result.ok).toBe(business === "matched");
    if (business === "rejected") expect(result.error).toBe("businessRejected");
  });

  it("never upgrades an HTTP failure when the body matches a success rule", async () => {
    respond({ saved: true }, 500);
    expect(await executeWebhook(withRule(), {})).toMatchObject({ ok: false, httpOk: false, state: "failed", status: 500, business: "matched" });
  });

  it.each([{}, null, { saved: null }])("marks unavailable success fields unconfirmed, without retrying: %s", async (body) => {
    respond(body);
    const result = await executeWebhook(withRule({ successPath: "saved.value" }), {});
    expect(result).toMatchObject({ ok: false, httpOk: true, state: "unknown", status: 200, error: "businessUnconfirmed" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not evaluate rules on incomplete or invalid JSON", async () => {
    fetch.mockResolvedValue(new Response('{"saved":true}' + " ".repeat(RESPONSE_LIMIT), { headers: { "Content-Type": "application/json" } }));
    expect(await executeWebhook(withRule(), {})).toMatchObject({ business: "unknown", status: 200, receipt: { note: "responseTruncated" } });
    fetch.mockResolvedValue(new Response("not JSON", { headers: { "Content-Type": "text/plain" } }));
    expect(await executeWebhook(withRule(), {})).toMatchObject({ business: "unknown", receipt: { fieldNote: "responseFieldMissing" } });
  });

  it("supports own properties and numeric array indices while refusing inherited fields", async () => {
    respond({ items: [{ id: "abc" }], data: { message: null }, saved: true });
    expect(await executeWebhook(withRule({ receiptPath: "items.0.id" }), {})).toMatchObject({ receipt: { receiptId: "abc", message: "null" } });
    respond({ data: {} });
    expect(await executeWebhook(withRule({ successPath: "data.toString" }), {})).toMatchObject({ business: "unknown" });
    respond(JSON.parse('{"__proto__":{"id":"own-data"},"saved":true}'));
    expect(await executeWebhook(withRule({ receiptPath: "__proto__.id" }), {})).toMatchObject({ receipt: { receiptId: "own-data" } });
  });

  it("bounds extracted text and leaves HTTP status alone for missing display fields", async () => {
    respond({ data: { message: "a".repeat(2000), id: { nested: "not a scalar" } } });
    const result = await executeWebhook(withRule({ successPath: "" }), {});
    expect(result).toMatchObject({ ok: true, state: "success", receipt: { message: "a".repeat(1000), fieldNote: "responseFieldMissing" } });
    expect(result.business).toBeUndefined();
  });

  it("keeps old and disabled templates on HTTP-only behavior", async () => {
    expect(() => validateResponseConfig()).not.toThrow();
    respond({ saved: false });
    expect(await executeWebhook(withRule({ enabled: false, successValue: "invalid" }), {})).toEqual({ ok: true, state: "success", status: 200 });
    respond({ saved: false });
    expect(await executeWebhook(enabled, {})).toMatchObject({ ok: true, state: "success" });
  });

  it.each([".data", "data..id", "data. id", "data ", "a".repeat(201), 12])("rejects invalid field paths before sending: %s", async (path) => {
    expect(await executeWebhook(withRule({ receiptPath: path }), {})).toMatchObject({ state: "failed", error: "invalidResponsePath" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["ok", "{}", "[]", "1e999", "", undefined])("rejects non-scalar or invalid success values: %s", async (value) => {
    expect(await executeWebhook(withRule({ successValue: value }), {})).toMatchObject({ state: "failed", error: "invalidSuccessValue" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
