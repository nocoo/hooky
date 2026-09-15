import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addFeedbackChrome } from "./chrome-mock.js";

const config = { id: "capture", name: "Capture", url: "https://example.com/save", method: "POST", duplicateWindow: 10, params: [{ key: "text", value: "{{page.selection}}" }, { key: "id", value: "{{send.id}}" }], headers: [{ key: "X-API-Key", value: "private-key" }, { key: "Idempotency-Key", value: "{{send.id}}" }] };
const context = { page: { selection: "private capture {{page.title}}" } };
const tab = { id: 1, url: "https://example.com/article" };
let session, send, duplicates;

beforeEach(async () => {
  vi.resetModules();
  global.chrome = {};
  session = addFeedbackChrome(chrome);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201 });
  send = await import("../src/send.js");
  duplicates = await import("../src/duplicates.js");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("per-template completed duplicate protection", () => {
  it.each([undefined, 0, -1, "10"])("does not enable completed duplicate protection for %s", async (duplicateWindow) => {
    const first = await send.sendWebhook({ ...config, duplicateWindow }, context, { tab });
    const second = await send.sendWebhook({ ...config, duplicateWindow }, context, { tab });
    expect(second.id).not.toBe(first.id);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session[duplicates.RECENT_SENDS_KEY]).toBeUndefined();
  });

  it("shows the previous result across tabs and entry points without persisting payloads or keys", async () => {
    const first = await send.sendWebhook(config, context, { tab, source: "context" });
    const second = await send.sendWebhook(config, context, { tab: { ...tab, id: 2 }, source: "quick" });
    expect(second).toMatchObject({ id: first.id, tabId: 2, state: "success", duplicateToken: expect.any(String) });
    expect(fetch).toHaveBeenCalledOnce();
    expect(session.hookyLastResult.duplicateToken).toBe(second.duplicateToken);
    const stored = JSON.stringify(session);
    expect(stored).not.toContain("private capture");
    expect(stored).not.toContain("private-key");
    expect(session[duplicates.RECENT_SENDS_KEY][0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const { resultMessage } = await import("../src/feedback.js");
    expect(resultMessage(second)).toContain("Repeated request skipped");
  });

  it("repeats the held capture only after an explicit action, using a new UUID", async () => {
    const original = structuredClone(config);
    const captured = structuredClone(context);
    const first = await send.sendWebhook(original, captured, { tab });
    const duplicate = await send.sendWebhook(original, captured, { tab });
    original.url = "https://changed.example";
    captured.page.selection = "changed after capture";
    const preview = duplicates.getDuplicateCapture(duplicate.duplicateToken).preview;
    expect(preview).toContain("https://example.com/save");
    expect(preview).toContain("private capture {{page.title}}");
    expect(preview).not.toContain("private-key");
    const repeated = await send.sendAnyway(duplicate.duplicateToken);
    expect(repeated.id).not.toBe(first.id);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, options] = fetch.mock.calls[1];
    expect(url).toBe("https://example.com/save");
    expect(JSON.parse(options.body)).toEqual({ text: "private capture {{page.title}}", id: repeated.id });
    expect(options.headers["idempotency-key"]).toBe(repeated.id);
    expect(await send.sendAnyway(duplicate.duplicateToken)).toMatchObject({ error: "captureExpired" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the pending guard in force even for two explicit Send anyway actions", async () => {
    await send.sendWebhook(config, context, { tab });
    const a = await send.sendWebhook(config, context, { tab });
    const b = await send.sendWebhook(config, context, { tab });
    let finish;
    fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const first = send.sendAnyway(a.duplicateToken);
    const second = send.sendAnyway(b.duplicateToken);
    expect(second).toBe(first);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    finish({ ok: true, status: 200 });
    await first;
  });

  it("shares a pending request between tabs and gives each tab feedback", async () => {
    let finish;
    fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const first = send.sendWebhook(config, context, { tab, source: "context" });
    const second = send.sendWebhook(config, context, { tab: { ...tab, id: 2 }, source: "quick" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    finish({ ok: true, status: 200 });
    const [a, b] = await Promise.all([first, second]);
    expect(a.id).toBe(b.id);
    expect(session["hookyResult:1"].state).toBe("success");
    expect(session["hookyResult:2"].state).toBe("success");
    expect(session.hookyLastResult.tabId).toBe(2);
  });

  it("allows new content, destinations, credentials and template IDs", async () => {
    await send.sendWebhook(config, context);
    await send.sendWebhook(config, { page: { selection: "other" } });
    await send.sendWebhook({ ...config, url: "https://other.example" }, context);
    await send.sendWebhook({ ...config, headers: [{ key: "X-API-Key", value: "different" }] }, context);
    await send.sendWebhook({ ...config, id: "different-template" }, context);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("expires the configurable time window, including when it is shortened", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    await send.sendWebhook(config, context);
    vi.setSystemTime(now + 2000);
    await send.sendWebhook({ ...config, duplicateWindow: 1 }, context);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.setSystemTime(now + 4000);
    await send.sendWebhook({ ...config, duplicateWindow: 1 }, context);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("bounds the protection window and does not extend it on a skipped send", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    await send.sendWebhook({ ...config, duplicateWindow: 1000 }, context);
    vi.setSystemTime(now + 290000);
    expect((await send.sendWebhook({ ...config, duplicateWindow: 1000 }, context)).duplicateToken).toBeTruthy();
    vi.setSystemTime(now + 300001);
    expect((await send.sendWebhook({ ...config, duplicateWindow: 1000 }, context)).duplicateToken).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retains a lost-response outcome and does not silently retry it", async () => {
    fetch.mockRejectedValue(new Error("response lost"));
    const first = await send.sendWebhook(config, context);
    const duplicate = await send.sendWebhook(config, context);
    expect(duplicate).toMatchObject({ id: first.id, state: "unknown", duplicateToken: expect.any(String) });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("restores fingerprints after a worker restart, but not the raw capture", async () => {
    await send.sendWebhook(config, context);
    const duplicate = await send.sendWebhook(config, context);
    vi.resetModules();
    send = await import("../src/send.js");
    duplicates = await import("../src/duplicates.js");
    expect(duplicates.getDuplicateCapture(duplicate.duplicateToken)).toBeNull();
    expect(await send.sendAnyway(duplicate.duplicateToken)).toMatchObject({ error: "captureExpired" });
    expect((await send.sendWebhook(config, context)).duplicateToken).toBeTruthy();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("recovers a persisted pending identity as unconfirmed without sending again", async () => {
    await send.sendWebhook(config, context);
    const entry = session[duplicates.RECENT_SENDS_KEY][0];
    entry.result = { id: "interrupted", name: "Capture", templateId: config.id, startedAt: Date.now(), state: "sending", tabId: null, source: "popup" };
    vi.resetModules();
    send = await import("../src/send.js");
    const result = await send.sendWebhook(config, context);
    expect(result).toMatchObject({ id: "interrupted", state: "unknown", error: "requestUnconfirmed", duplicateToken: expect.any(String) });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("refuses an opted-in request if its identity cannot be checked, then recovers", async () => {
    chrome.storage.session.get.mockRejectedValueOnce(new Error("unavailable"));
    expect(await send.sendWebhook(config, context)).toMatchObject({ error: "duplicateCheckFailed", state: "failed" });
    expect(fetch).not.toHaveBeenCalled();
    expect((await send.sendWebhook(config, context)).ok).toBe(true);
  });

  it.each([false, true])("rolls back unsent identities if their initial write fails (previous=%s)", async (hasPrevious) => {
    let token;
    if (hasPrevious) {
      await send.sendWebhook(config, context);
      token = (await send.sendWebhook(config, context)).duplicateToken;
    }
    const count = fetch.mock.calls.length;
    chrome.storage.session.set.mockImplementationOnce(async () => { throw new Error("storage full"); });
    const result = await (hasPrevious ? send.sendAnyway(token) : send.sendWebhook(config, context));
    expect(result.error).toBe("duplicateCheckFailed");
    expect(fetch).toHaveBeenCalledTimes(count);
    const next = await send.sendWebhook(config, context);
    expect(next.ok).toBe(true);
    expect(Boolean(next.duplicateToken)).toBe(hasPrevious);
  });

  it("preserves HTTP success if the final history update fails", async () => {
    const set = chrome.storage.session.set.getMockImplementation();
    chrome.storage.session.set.mockImplementation(async (values) => {
      if (values[duplicates.RECENT_SENDS_KEY]?.[0].result.state === "success") throw new Error("storage unavailable");
      return set(values);
    });
    const result = await send.sendWebhook(config, context);
    expect(result).toMatchObject({ ok: true, status: 201 });
    expect((await send.sendWebhook(config, context)).duplicateToken).toBeTruthy();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps a delayed older start from replacing a newer result", async () => {
    let finishDigest;
    vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(() => new Promise((resolve) => { finishDigest = resolve; })).mockResolvedValueOnce(new Uint8Array(32).fill(2).buffer);
    const older = send.sendWebhook(config, context);
    const newer = await send.sendWebhook(config, { page: { selection: "newer" } });
    finishDigest(new Uint8Array(32).fill(1).buffer);
    await older;
    expect(session.hookyLastResult.id).toBe(newer.id);
  });

  it("bounds both session metadata and transient captures, and expires held captures", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    for (let i = 0; i < 51; i++) await duplicates.rememberSend(String(i), { id: String(i), state: "success", startedAt: now, finishedAt: now }, 10);
    expect(session[duplicates.RECENT_SENDS_KEY]).toHaveLength(50);
    expect(await duplicates.findRecent("0", 10)).toBeNull();
    const first = duplicates.holdDuplicate(config, context, { resolved: false });
    for (let i = 0; i < 20; i++) duplicates.holdDuplicate(config, context, { resolved: false });
    expect(duplicates.getDuplicateCapture(first)).toBeNull();
    const last = duplicates.holdDuplicate(config, context, { resolved: false });
    await vi.advanceTimersByTimeAsync(duplicates.CAPTURE_LIFETIME);
    vi.setSystemTime(now + duplicates.CAPTURE_LIFETIME);
    expect(await send.sendAnyway(last)).toMatchObject({ error: "captureExpired" });
    expect(duplicates.getDuplicateCapture(last)).toBeNull();
    expect(await duplicates.findRecent("50", 10)).toBeNull();
  });
});
