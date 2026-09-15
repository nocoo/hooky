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
    expect(session.hookyLastResult.state).toBe("sending");
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
