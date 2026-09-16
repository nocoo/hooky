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
  expect(mount().shadowRoot.querySelector('[role="alert"]').getAttribute("aria-live")).toBe("assertive");
  expect(mount().shadowRoot.querySelector(".close").getAttribute("aria-label")).toBe("Dismiss");
  await vi.advanceTimersByTimeAsync(60000);
  expect(mount()).not.toBeNull();
});

it("keeps a success available during interaction and dismisses it after leaving", async () => {
  showPageFeedback({ ...result, state: "success" }, "Done", labels, location.href);
  const card = mount().shadowRoot.querySelector("section");
  // jsdom does not evaluate focus-within across shadow roots; the browser smoke check covers real focus.
  const interacting = vi.spyOn(card, "matches").mockReturnValue(true);
  card.dispatchEvent(new Event("pointerleave"));
  expect(mount()).not.toBeNull();
  await vi.advanceTimersByTimeAsync(8000);
  expect(mount()).not.toBeNull();
  card.dispatchEvent(new Event("focusout"));
  await vi.advanceTimersByTimeAsync(0);
  expect(mount()).not.toBeNull();
  interacting.mockReturnValue(false);
  card.dispatchEvent(new Event("pointerleave"));
  expect(mount()).toBeNull();
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

it("ignores a delayed sending toast after its final outcome has already appeared", () => {
  showPageFeedback({ ...result, state: "success" }, "Done", labels, location.href);
  showPageFeedback(result, "Delayed sending", labels, location.href);
  expect(mount().shadowRoot.textContent).toContain("Done");
  expect(mount().shadowRoot.textContent).not.toContain("Delayed sending");
});

it("keeps a repeated-result toast for its own full lifetime", async () => {
  showPageFeedback({ ...result, state: "success" }, "Done", labels, location.href);
  await vi.advanceTimersByTimeAsync(4000);
  showPageFeedback({ ...result, state: "success", startedAt: 2 }, "Repeated request skipped", labels, location.href);
  await vi.advanceTimersByTimeAsync(4000);
  expect(mount().shadowRoot.textContent).toContain("Repeated request skipped");
  await vi.advanceTimersByTimeAsync(4000);
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
