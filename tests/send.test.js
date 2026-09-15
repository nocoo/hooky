import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { addFeedbackChrome } from "./chrome-mock.js";

const config = { id: "save", name: "Save", url: "http://127.0.0.1:4321/capture", method: "POST", params: [{ key: "text", value: "{{page.selection}}" }] };
const context = { page: { selection: "private selection", url: "https://example.com/article" } };
const tab = { id: 7, url: "https://example.com/article" };
let session, sendWebhook, feedback;

beforeEach(async () => {
  vi.resetModules();
  global.chrome = {};
  session = addFeedbackChrome(chrome);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201 });
  ({ sendWebhook } = await import("../src/send.js"));
  feedback = await import("../src/feedback.js");
});

afterEach(() => { vi.useRealTimers(); });

describe("shared send lifecycle", () => {
  it("coalesces requests when unused rows and URL fragments differ between capture surfaces", async () => {
    let finish;
    fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const a = sendWebhook({ ...config, url: config.url + "#settings", params: [...config.params, { key: "", value: "{{send.id}}" }], headers: [{ key: " Idempotency-Key ", value: "{{send.id}}" }] }, context, { tab });
    const b = sendWebhook({ ...config, headers: [{ key: "Idempotency-Key", value: "{{send.id}}" }] }, context, { tab });
    expect(b).toBe(a);
    expect(fetch.mock.calls[0][0]).toBe(config.url);
    finish({ ok: true, status: 200 });
    await a;
  });

  it.each(["GET", "DELETE"])("sends the actual UUID and preserves literal query values for %s endpoints with fragments", async (method) => {
    const result = await sendWebhook({ ...config, method, url: config.url + "#section", params: [{ key: "id", value: "{{send.id}}", resolve: true }, { key: "text", value: "  {{send.id}}\nline  " }] }, context, { tab, resolved: true });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.hash).toBe("");
    expect(url.searchParams.get("id")).toBe(result.id);
    expect(url.searchParams.get("text")).toBe("  {{send.id}}\nline  ");
  });

  it("sends immediately even if page feedback stalls and bounds the wait for UI", async () => {
    vi.useFakeTimers();
    chrome.scripting.executeScript.mockImplementation(() => new Promise(() => {}));
    const task = sendWebhook(config, context, { tab, source: "context" });
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(feedback.PAGE_FEEDBACK_TIMEOUT * 2);
    expect(await task).toMatchObject({ ok: true, state: "success" });
    expect(chrome.action.openPopup).toHaveBeenCalledOnce();
    expect(session.hookyLastResult.state).toBe("success");
  });

  it.each(["popup", "quick", "context"])("uses one UUID in headers and body through the %s entry path", async (source) => {
    const bound = { ...config, headers: [{ key: "Authorization", value: "Bearer private-token" }, { key: "Idempotency-Key", value: "{{send.id}}" }], params: [
      { key: "id", value: "{{ send.id }}", resolve: true },
      { key: "text", value: "{{page.selection}}", resolve: true },
    ] };
    const result = await sendWebhook(bound, { page: { selection: "  literal {{send.id}}\n{{page.title}}  " } }, { tab, source, resolved: source === "popup" });
    const options = fetch.mock.calls[0][1];
    expect(result.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(options.headers["idempotency-key"]).toBe(result.id);
    expect(JSON.parse(options.body)).toEqual({ id: result.id, text: "  literal {{send.id}}\n{{page.title}}  " });
    expect(JSON.stringify(session)).not.toContain("private-token");
    expect(JSON.stringify(chrome.scripting.executeScript.mock.calls)).not.toContain("private-token");
    const next = await sendWebhook(bound, context, { tab, source });
    expect(next.id).not.toBe(result.id);
  });

  it("does not let generated UUIDs defeat the pending guard", async () => {
    let finish;
    fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const bound = { ...config, headers: [{ key: "Idempotency-Key", value: "{{send.id}}" }], params: [{ key: "id", value: "{{send.id}}" }] };
    const a = sendWebhook(bound, context, { tab });
    const b = sendWebhook({ ...bound, params: [{ ...bound.params[0], resolve: true }] }, context, { tab, resolved: true });
    expect(b).toBe(a);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    finish({ ok: true, status: 200 });
    await a;
  });

  it("keeps edited literal fields separate from UUID bindings", async () => {
    const result = await sendWebhook({ ...config, params: [
      { key: "id", value: "{{send.id}}", resolve: true },
      { key: "pasted", value: "  {{send.id}}\n{{page.title}}  " },
      { key: "__proto__", value: "literal" },
    ] }, context, { tab, resolved: true });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.id).toBe(result.id);
    expect(body.pasted).toBe("  {{send.id}}\n{{page.title}}  ");
    expect(Object.hasOwn(body, "__proto__")).toBe(true);
  });

  it("retains status after the toast expires without retaining captured content", async () => {
    vi.useFakeTimers();
    const result = await sendWebhook(config, context, { tab, source: "context" });
    await vi.advanceTimersByTimeAsync(10000);
    expect(session.hookyLastResult).toEqual(result);
    expect(result).toMatchObject({ ok: true, status: 201, state: "success", name: "Save", tabId: 7 });
    expect(JSON.stringify(session)).not.toContain("private selection");
    expect(JSON.stringify(chrome.scripting.executeScript.mock.calls)).not.toContain("private selection");
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: "✓" });
    expect(await feedback.readLastResult()).toEqual(result);
  });

  it("coalesces pending sends across entry points using their effective payload", async () => {
    let finish;
    fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const first = sendWebhook(config, context, { tab, source: "context" });
    const second = sendWebhook({ ...config, params: [{ key: "text", value: "private selection" }] }, { page: {} }, { tab, source: "popup", resolved: true });
    expect(second).toBe(first);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(session.hookyLastResult?.state).toBe("sending"));
    finish({ ok: true, status: 201 });
    const [a, b] = await Promise.all([first, second]);
    expect(a.id).toBe(b.id);
    fetch.mockResolvedValue({ ok: true, status: 201 });
    await sendWebhook(config, context, { tab });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("allows different selections and keeps an older completion from overwriting the newer send", async () => {
    const finish = [];
    fetch.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
    const first = sendWebhook(config, context, { tab, source: "quick" });
    await vi.waitFor(() => expect(finish).toHaveLength(1));
    const second = sendWebhook(config, { page: { selection: "another selection" } }, { tab, source: "quick" });
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    finish[1]({ ok: true, status: 201 });
    const newer = await second;
    finish[0]({ ok: false, status: 500 });
    const older = await first;
    expect(older.id).not.toBe(newer.id);
    expect(session.hookyLastResult.id).toBe(newer.id);
    expect(session["hookyResult:7"].state).toBe("success");
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: "✓" });
  });

  it("keeps feedback separate for different tabs", async () => {
    await sendWebhook(config, context, { tab });
    await sendWebhook(config, context, { tab: { ...tab, id: 8 } });
    expect(session["hookyResult:7"].tabId).toBe(7);
    expect(session["hookyResult:8"].tabId).toBe(8);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["file:///tmp/capture", "javascript:alert(1)", "not a url"])("rejects an invalid endpoint before sending: %s", async (url) => {
    const result = await sendWebhook({ ...config, url }, context);
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ state: "failed", error: "invalidEndpoint" });
    expect(session.hookyLastResult).toEqual(result);
  });

  it("reports lost responses as unconfirmed and never retries automatically", async () => {
    fetch.mockRejectedValue(new Error("connection lost after writing"));
    const result = await sendWebhook(config, context, { tab });
    expect(result.state).toBe("unknown");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: "?" });
    expect(feedback.resultMessage(result)).toContain("Check the receiver");
  });

  it("aborts a hanging request and releases the pending guard", async () => {
    vi.useFakeTimers();
    fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const task = sendWebhook(config, context, { tab });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(20000);
    expect((await task).state).toBe("unknown");
    fetch.mockResolvedValue({ ok: true, status: 200 });
    expect((await sendWebhook(config, context, { tab })).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not turn a successful send into a failure when feedback APIs fail", async () => {
    chrome.storage.session.get.mockRejectedValue(new Error("unavailable"));
    chrome.storage.session.set.mockRejectedValue(new Error("unavailable"));
    chrome.action.setBadgeText.mockRejectedValue(new Error("tab closed"));
    chrome.scripting.executeScript.mockRejectedValue(new Error("tab closed"));
    chrome.action.openPopup.mockRejectedValue(new Error("window closed"));
    chrome.tabs.create.mockRejectedValue(new Error("window closed"));
    expect((await sendWebhook(config, context, { tab, source: "quick" })).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the extension panel when a page cannot display feedback", async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: false }]);
    await sendWebhook(config, context, { tab, source: "context" });
    expect(chrome.action.openPopup).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("viewing and recovering results", () => {
  it("opens a panel independently of sending, and resets the toolbar even on fallback", async () => {
    chrome.action.openPopup.mockRejectedValue(new Error("not focused"));
    const a = feedback.openPanel();
    const b = feedback.openPanel();
    expect(a).toBe(b);
    await a;
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome-extension://hooky/src/popup/popup.html" });
    expect(chrome.action.setPopup).toHaveBeenLastCalledWith({ popup: "" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recovers interrupted sends after a worker restart without replaying them", async () => {
    const pending = { id: "old", name: "Save", state: "sending", tabId: 7, startedAt: 123 };
    await chrome.storage.session.set({ hookyLastResult: pending, "hookyResult:7": pending, other: { state: "sending" } });
    await feedback.recoverPendingResults();
    expect(session.hookyLastResult.state).toBe("unknown");
    expect(session["hookyResult:7"].state).toBe("unknown");
    expect(session.other.state).toBe("sending");
    expect(fetch).not.toHaveBeenCalled();
    chrome.storage.session.set.mockClear();
    await feedback.recoverPendingResults();
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  it("handles an empty session and formats accepted, rejected and invalid requests", async () => {
    expect(await feedback.readLastResult()).toBeNull();
    expect(feedback.resultMessage({ state: "success", status: 202 })).toContain("Processing");
    expect(feedback.resultMessage({ state: "failed", error: "invalidEndpoint" })).toContain("HTTP or HTTPS");
    expect(feedback.resultMessage({ state: "failed", status: 401 })).toContain("401");
  });
});

describe("optional desktop notifications", () => {
  it.each([
    [undefined, "success", false], ["off", "failed", false], ["invalid", "failed", false],
    ["errors", "success", false], ["errors", "failed", true], ["errors", "unknown", true], ["all", "success", true],
  ])("respects mode %s for %s outcomes", async (notificationMode, state, expected) => {
    chrome.storage.local.get.mockResolvedValue({ hooky: { notificationMode } });
    chrome.permissions.contains.mockResolvedValue(true);
    const result = { id: "notice", name: "Save", state, status: 201, ok: state === "success", receipt: { text: "private-receipt" } };
    await feedback.showDesktopNotification(result);
    expect(chrome.notifications.create).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    expect(JSON.stringify(chrome.notifications.create.mock.calls)).not.toContain("private-receipt");
  });

  it("keeps the result available when permission is revoked or notification delivery fails", async () => {
    chrome.storage.local.get.mockResolvedValue({ hooky: { notificationMode: "all" } });
    await sendWebhook(config, context, { tab });
    expect(chrome.notifications.create).not.toHaveBeenCalled();
    chrome.permissions.contains.mockResolvedValue(true);
    chrome.notifications.create.mockRejectedValue(new Error("not available"));
    const result = await sendWebhook(config, context, { tab });
    expect(result.state).toBe("success");
    expect(session.hookyLastResult).toEqual(result);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: "✓" });
  });
});
