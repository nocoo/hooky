// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { showPageFeedback } from "../src/feedback.js";

const labels = { view: "Latest send", close: "Dismiss" };
const result = { id: "a", name: "Save", state: "sending", startedAt: 1 };
const mount = () => document.getElementById("__hooky_send_feedback");

beforeEach(() => {
  vi.useFakeTimers();
  mount()?.remove();
  global.chrome = { runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) } };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); mount()?.remove(); });

it("shows accessible feedback at the capture location and provides a view-only action", async () => {
  expect(showPageFeedback(result, "Sending…", labels, location.href)).toBe(true);
  const root = mount().shadowRoot;
  expect(root.querySelector('[role="status"]').textContent).toContain("Save");
  root.querySelector("button").click();
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "OPEN_PANEL" });
  await vi.advanceTimersByTimeAsync(9000);
  expect(mount()).not.toBeNull();
  root.querySelectorAll("button")[1].click();
  expect(mount()).toBeNull();
});

it("keeps errors visible and treats all supplied text as text", async () => {
  showPageFeedback({ ...result, state: "failed", name: '<img src=x onerror="alert(1)">' }, "<b>Failed</b>", labels, location.href);
  expect(mount().shadowRoot.querySelector("img")).toBeNull();
  expect(mount().shadowRoot.querySelector('[role="alert"]').textContent).toContain("<b>Failed</b>");
  await vi.advanceTimersByTimeAsync(60000);
  expect(mount()).not.toBeNull();
});

it("expires success after eight seconds without dismissing a subsequent send", async () => {
  showPageFeedback({ ...result, state: "success" }, "Success", labels, location.href);
  await vi.advanceTimersByTimeAsync(4000);
  showPageFeedback({ ...result, id: "b", startedAt: 2 }, "Sending again", labels, location.href);
  showPageFeedback(result, "Older completion", labels, location.href);
  await vi.advanceTimersByTimeAsync(4000);
  expect(mount().shadowRoot.textContent).toContain("Sending again");
  showPageFeedback({ ...result, id: "b", startedAt: 2, state: "success" }, "Done", labels, location.href);
  await vi.advanceTimersByTimeAsync(8000);
  expect(mount()).toBeNull();
});

it("does not inject into a different page after navigation", () => {
  expect(showPageFeedback(result, "Sending", labels, "https://elsewhere.example")).toBe(false);
  expect(mount()).toBeNull();
});

it("allows result viewing to fail without an unhandled page error", async () => {
  chrome.runtime.sendMessage.mockRejectedValue(new Error("extension unavailable"));
  showPageFeedback({ ...result, state: "unknown" }, "Unconfirmed", labels, location.href);
  mount().shadowRoot.querySelector("button").click();
  await Promise.resolve();
  expect(mount().shadowRoot.querySelector('[role="alert"]')).not.toBeNull();
});

it("falls back when the document has no root", () => {
  vi.stubGlobal("document", { documentElement: null });
  expect(showPageFeedback(result, "Sending", labels, location.href)).toBe(false);
});
