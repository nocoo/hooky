import { addFeedbackChrome } from "./chrome-mock.js";
import { readFileSync } from "node:fs";
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the pagecontext module before any imports
vi.mock("../src/pagecontext.js", () => ({
  getPageContext: vi.fn(),
}));

// Set up DOM structure that popup.js expects at import time
function setupPopupDOM() {
  document.body.innerHTML = readFileSync("src/popup/popup.html", "utf8").split("<body>")[1].split("</body>")[0];
}

// Set up chrome mock
function setupChromeMock(storeData = {}) {
  global.chrome = {
    runtime: {
      openOptionsPage: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    },
    tabs: {
      query: vi.fn().mockResolvedValue([
        { id: 1, url: "https://example.com", title: "Example" },
      ]),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue(storeData),
        set: vi.fn().mockResolvedValue(),
      },
    },
    i18n: {
      getMessage: vi.fn((key) => {
        const messages = {
          send: "Send",
          sending: "Sending...",
          successStatus: "Success ($1)",
          failedStatus: "Failed ($1)",
          requestFailed: "Request failed",
          defaultTemplateName: "Untitled",
          settingsTooltip: "Settings",
        };
        return messages[key] || key;
      }),
    },
  };
  addFeedbackChrome(global.chrome);
}

/**
 * Helper to set up the getPageContext mock before importing popup.js.
 * Must be called after setupChromeMock so that chrome.tabs.query is ready.
 */
async function setupPageContextMock(contextData) {
  const { getPageContext } = await import("../src/pagecontext.js");
  getPageContext.mockResolvedValue(
    contextData || {
      page: {
        url: "https://example.com",
        title: "Example",
        selection: "",
        meta: {},
      },
    },
  );
}

describe("popup.js", () => {
  it("renders opted-in receipts as text and clears them on the next result", async () => {
    setupChromeMock({ hooky: { templates: [] } });
    const record = { id: "receipt", name: "Save", state: "success", status: 201, ok: true, startedAt: Date.now(), receipt: { text: '<img src="x" onerror="danger()">', note: "responseInvalidJson" } };
    await chrome.storage.session.set({ hookyLastResult: record });
    await import("../src/popup/popup.js");
    await vi.waitFor(() => expect(document.getElementById("last-response").hidden).toBe(false));
    expect(document.getElementById("response-body").textContent).toBe(record.receipt.text);
    expect(document.getElementById("response-body").querySelector("img")).toBeNull();
    expect(document.getElementById("response-note").textContent).toBe("responseInvalidJson");
    const changed = chrome.storage.onChanged.addListener.mock.calls[0][0];
    changed({ hookyLastResult: { newValue: { ...record, receipt: undefined } } }, "session");
    expect(document.getElementById("last-response").hidden).toBe(true);
    expect(document.getElementById("response-body").textContent).toBe("");
  });

  it("previews masked headers, preserves untouched bindings, and allows manual multiline input", async () => {
    const template = { id: "t1", name: "Notes", url: "https://example.com/hook", method: "POST", headers: [{ key: "X-API-Key", value: "private-token" }], params: [
      { key: "id", value: "{{send.id}}" }, { key: "text", value: "" }, { key: "selected", value: "{{page.selection}}" },
    ] };
    setupChromeMock({ hooky: { templates: [template], activeTemplateId: "t1" } });
    await setupPageContextMock({ page: { url: "https://example.com", title: "Example", selection: "{{send.id}}", meta: {} } });
    await import("../src/popup/popup.js");
    await vi.waitFor(() => expect(document.querySelectorAll(".param-item textarea")).toHaveLength(3));
    const values = document.querySelectorAll(".param-item textarea");
    expect(values[0].value).toBe("{{send.id}}");
    values[1].value = "  manual {{page.title}}\nsecond line  ";
    values[1].dispatchEvent(new Event("input", { bubbles: true }));
    const preview = document.getElementById("popup-request-preview").textContent;
    expect(preview).toContain("x-api-key: ••••");
    expect(preview).not.toContain("private-token");
    expect(preview).toContain('"selected": "{{send.id}}"');
    document.getElementById("send-btn").click();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalled());
    const message = chrome.runtime.sendMessage.mock.calls[0][0];
    expect(message.config.params).toEqual([
      { key: "id", value: "{{send.id}}", resolve: true },
      { key: "text", value: "  manual {{page.title}}\nsecond line  " },
      { key: "selected", value: "{{page.selection}}", resolve: true },
    ]);
    expect(message.context.page.selection).toBe("{{send.id}}");
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("shows request validation errors without exposing header values", async () => {
    setupChromeMock({ hooky: { templates: [{ id: "t1", name: "Notes", url: "https://example.com", method: "POST", params: [], headers: [{ key: "Cookie", value: "secret" }] }] } });
    await setupPageContextMock();
    await import("../src/popup/popup.js");
    await vi.waitFor(() => expect(document.getElementById("popup-request-preview").textContent).toBe("managedHeader"));
  });

  it("shows a retained result without sending and updates it from session changes", async () => {
    setupChromeMock({ hooky: { templates: [], theme: "system" } });
    const record = { id: "retained", name: "Save", state: "sending", startedAt: Date.now() };
    await chrome.storage.session.set({ hookyLastResult: record });
    await setupPageContextMock();
    await import("../src/popup/popup.js");
    await vi.waitFor(() => expect(document.getElementById("last-result").hidden).toBe(false));
    expect(document.getElementById("last-result-name").textContent).toBe("Save");
    const changed = chrome.storage.onChanged.addListener.mock.calls[0][0];
    changed({ hookyLastResult: { newValue: { ...record, state: "unknown", ok: false } } }, "session");
    expect(document.getElementById("last-result-status").className).toBe("error");
    changed({ hookyLastResult: { newValue: { ...record, state: "success", ok: true, status: 201 } } }, "local");
    expect(document.getElementById("last-result-status").className).toBe("error");
    changed({}, "session");
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setupPopupDOM();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete global.chrome;
  });

  it("preserves multiline selection and literal variable text when editing before send", async () => {
    setupChromeMock({ hooky: {
      templates: [{ id: "t1", name: "Notes", url: "https://example.com/hook", method: "POST", params: [{ key: "note", value: "{{page.selection}}" }] }],
      activeTemplateId: "t1",
      theme: "light",
    } });
    await setupPageContextMock({ page: { url: "https://example.com", title: "Example", selection: "First line\nSecond line", meta: {} } });
    await import("../src/popup/popup.js");
    await vi.waitFor(() => expect(document.querySelector(".param-item textarea")).not.toBeNull());
    const field = document.querySelector(".param-item textarea");
    expect(field.value).toBe("First line\nSecond line");
    field.value = "  edited {{page.title}}\nSecond line  ";
    document.getElementById("send-btn").click();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      resolved: true,
      config: expect.objectContaining({ params: [{ key: "note", value: "  edited {{page.title}}\nSecond line  " }] }),
    })));
    await vi.advanceTimersByTimeAsync(8100);
    expect(document.getElementById("toast").classList.contains("visible")).toBe(false);
  });

  it("should show no-config when store has no templates", async () => {
    setupChromeMock({ hooky: { templates: [], theme: "system" } });
    await setupPageContextMock();
    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("no-config").style.display).toBe("block");
    });
    expect(document.getElementById("webhook-panel").style.display).toBe("none");
  });

  it("should show webhook panel when templates exist", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://hook.com", method: "POST", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    await setupPageContextMock();
    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("webhook-panel").style.display).toBe("block");
    });
    expect(document.getElementById("no-config").style.display).toBe("none");
  });

  it("should populate template select dropdown", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Hook A", url: "https://a.com", method: "GET", params: [] },
          { id: "t2", name: "Hook B", url: "https://b.com", method: "POST", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    await setupPageContextMock();
    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      const select = document.getElementById("template-select");
      expect(select.children).toHaveLength(2);
    });
    const select = document.getElementById("template-select");
    expect(select.children[0].textContent).toBe("Hook A");
    expect(select.children[1].textContent).toBe("Hook B");
    expect(select.value).toBe("t1");
  });

  it("should display method badge and url for active template", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://hook.example.com/endpoint", method: "PUT", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    await setupPageContextMock();
    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("method-badge").textContent).toBe("PUT");
    });
    expect(document.getElementById("url-display").textContent).toBe("https://hook.example.com/endpoint");
  });

  it("should render params with resolved template values", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          {
            id: "t1", name: "Test", url: "https://h.com", method: "POST",
            params: [
              { key: "url", value: "{{page.url}}" },
              { key: "note", value: "static value" },
            ],
          },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    await setupPageContextMock();
    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      const items = document.querySelectorAll(".param-item");
      expect(items).toHaveLength(2);
    });

    const items = document.querySelectorAll(".param-item");
    expect(items[0].querySelector(".param-key").textContent).toBe("url");
    expect(items[0].querySelector("textarea").value).toBe("https://example.com");
    expect(items[1].querySelector("textarea").value).toBe("static value");
  });

  it("should open settings page when settings button is clicked", async () => {
    setupChromeMock({ hooky: { templates: [], theme: "system" } });
    await setupPageContextMock();
    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("no-config").style.display).toBe("block");
    });

    document.getElementById("settings-btn").click();
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it("should open settings page when go-settings button is clicked", async () => {
    setupChromeMock({ hooky: { templates: [], theme: "system" } });
    await setupPageContextMock();
    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("no-config").style.display).toBe("block");
    });

    document.getElementById("go-settings").click();
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it("should send webhook and show success toast", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://h.com", method: "POST", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    chrome.runtime.sendMessage.mockResolvedValue({ ok: true, status: 200 });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("webhook-panel").style.display).toBe("block");
    });

    document.getElementById("send-btn").click();

    await vi.waitFor(() => {
      const toast = document.getElementById("toast");
      expect(toast.classList.contains("visible")).toBe(true);
    });

    const toast = document.getElementById("toast");
    expect(toast.classList.contains("success")).toBe(true);
  });

  it("should show error toast when webhook fails", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://h.com", method: "POST", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    chrome.runtime.sendMessage.mockResolvedValue({ ok: false, status: 500 });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("webhook-panel").style.display).toBe("block");
    });

    document.getElementById("send-btn").click();

    await vi.waitFor(() => {
      const toast = document.getElementById("toast");
      expect(toast.classList.contains("visible")).toBe(true);
    });

    const toast = document.getElementById("toast");
    expect(toast.classList.contains("error")).toBe(true);
  });

  it("should handle template change via select", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Hook A", url: "https://a.com", method: "GET", params: [] },
          { id: "t2", name: "Hook B", url: "https://b.com", method: "DELETE", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("method-badge").textContent).toBe("GET");
    });

    const select = document.getElementById("template-select");
    select.value = "t2";
    select.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(document.getElementById("method-badge").textContent).toBe("DELETE");
    });
    expect(document.getElementById("url-display").textContent).toBe("https://b.com");
  });

  it("should fallback to tab info when script injection is unavailable", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          {
            id: "t1", name: "Test", url: "https://h.com", method: "POST",
            params: [{ key: "url", value: "{{page.url}}" }],
          },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    // getPageContext returns fallback with tab info
    await setupPageContextMock({
      page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
    });

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      const items = document.querySelectorAll(".param-item");
      expect(items).toHaveLength(1);
    });

    // Should fall back to tab.url
    const input = document.querySelector(".param-item textarea");
    expect(input.value).toBe("https://example.com");
  });

  it("should handle sendMessage error gracefully", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://h.com", method: "POST", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    chrome.runtime.sendMessage.mockRejectedValue(new Error("Network error"));
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("webhook-panel").style.display).toBe("block");
    });

    document.getElementById("send-btn").click();

    await vi.waitFor(() => {
      const toast = document.getElementById("toast");
      expect(toast.classList.contains("visible")).toBe(true);
      expect(toast.classList.contains("error")).toBe(true);
    });
  });

  it("should not send when no template is active", async () => {
    setupChromeMock({ hooky: { templates: [], theme: "system" } });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("no-config").style.display).toBe("block");
    });

    // sendBtn click with no current template should be a no-op
    document.getElementById("send-btn").click();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "EXECUTE_WEBHOOK" }),
    );
  });

  it("should skip params with empty key", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          {
            id: "t1", name: "Test", url: "https://h.com", method: "POST",
            params: [
              { key: "", value: "should be skipped" },
              { key: "msg", value: "hello" },
            ],
          },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      const items = document.querySelectorAll(".param-item");
      expect(items).toHaveLength(1);
    });

    const item = document.querySelector(".param-item");
    expect(item.querySelector(".param-key").textContent).toBe("msg");
  });

  it("should send webhook with resolved params", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          {
            id: "t1", name: "Test", url: "https://h.com", method: "POST",
            params: [
              { key: "url", value: "{{page.url}}" },
              { key: "msg", value: "hi" },
            ],
          },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    chrome.runtime.sendMessage.mockResolvedValue({ ok: true, status: 200 });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      const items = document.querySelectorAll(".param-item");
      expect(items).toHaveLength(2);
    });

    document.getElementById("send-btn").click();

    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "EXECUTE_WEBHOOK",
          config: expect.objectContaining({
            params: expect.arrayContaining([
              expect.objectContaining({ key: "url" }),
              expect.objectContaining({ key: "msg", value: "hi" }),
            ]),
          }),
        }),
      );
    });
  });

  it("should show error message from result.error", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://h.com", method: "POST", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: false,
      status: 400,
      error: "Bad Request",
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("webhook-panel").style.display).toBe("block");
    });

    document.getElementById("send-btn").click();

    await vi.waitFor(() => {
      const toast = document.getElementById("toast");
      expect(toast.textContent).toBe("Bad Request");
    });
  });

  it("should handle null tab id in getPopupPageContext", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          {
            id: "t1", name: "Test", url: "https://h.com", method: "POST",
            params: [{ key: "url", value: "{{page.url}}" }],
          },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    // Tab with no id
    chrome.tabs.query.mockResolvedValue([{ url: "about:blank", title: "New Tab" }]);

    // getPageContext will receive tab without id and return fallback
    await setupPageContextMock({
      page: { url: "", title: "", selection: "", meta: {} },
    });

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      const items = document.querySelectorAll(".param-item");
      expect(items).toHaveLength(1);
    });
  });

  it("should fallback to first template when activeTemplateId is missing", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "First", url: "https://first.com", method: "GET", params: [] },
        ],
        theme: "system",
      },
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("method-badge").textContent).toBe("GET");
    });
  });

  it("should use fallback context from pagecontext module", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          {
            id: "t1", name: "Test", url: "https://h.com", method: "POST",
            params: [{ key: "title", value: "{{page.title}}" }],
          },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    chrome.tabs.query.mockResolvedValue([{ id: 1, url: "https://example.com", title: "Example Tab" }]);

    // getPageContext returns fallback with tab title
    await setupPageContextMock({
      page: { url: "https://example.com", title: "Example Tab", selection: "", meta: {} },
    });

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      const items = document.querySelectorAll(".param-item");
      expect(items).toHaveLength(1);
    });

    // Should use tab title from fallback
    const input = document.querySelector(".param-item textarea");
    expect(input.value).toBe("Example Tab");
  });

  it("should handle template with no method (defaults to POST)", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://h.com", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("method-badge").textContent).toBe("POST");
    });
  });

  it("should handle template with no name (uses default)", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "", url: "https://h.com", method: "GET", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      const select = document.getElementById("template-select");
      expect(select.children[0].textContent).toBe("Untitled");
    });
  });

  it("should handle store with no theme (defaults to system)", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://h.com", method: "POST", params: [] },
        ],
        activeTemplateId: "t1",
      },
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("webhook-panel").style.display).toBe("block");
    });
    // theme should default to system (no data-theme attribute)
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("should handle store with no templates key", async () => {
    setupChromeMock({
      hooky: {},
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("no-config").style.display).toBe("block");
    });
  });

  it("should handle failed webhook with no status", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://h.com", method: "POST", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    chrome.runtime.sendMessage.mockResolvedValue({ ok: false });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("webhook-panel").style.display).toBe("block");
    });

    document.getElementById("send-btn").click();

    await vi.waitFor(() => {
      const toast = document.getElementById("toast");
      expect(toast.classList.contains("error")).toBe(true);
    });
  });

  it("should handle catch branch with error without message", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://h.com", method: "POST", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    chrome.runtime.sendMessage.mockRejectedValue({});
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("webhook-panel").style.display).toBe("block");
    });

    document.getElementById("send-btn").click();

    await vi.waitFor(() => {
      const toast = document.getElementById("toast");
      expect(toast.classList.contains("error")).toBe(true);
    });
  });

  it("should handle template with null params", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Test", url: "https://h.com", method: "POST", params: null },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("webhook-panel").style.display).toBe("block");
    });
    expect(document.querySelectorAll(".param-item")).toHaveLength(0);
  });

  it("should fallback to first template when activeTemplateId does not match any template", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "First", url: "https://first.com", method: "PUT", params: [] },
          { id: "t2", name: "Second", url: "https://second.com", method: "DELETE", params: [] },
        ],
        activeTemplateId: "non-existent-id",
        theme: "system",
      },
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      // Should fallback to first template
      expect(document.getElementById("method-badge").textContent).toBe("PUT");
    });
    expect(document.getElementById("url-display").textContent).toBe("https://first.com");
  });

  it("should handle template select change to non-existent template", async () => {
    setupChromeMock({
      hooky: {
        templates: [
          { id: "t1", name: "Hook A", url: "https://a.com", method: "GET", params: [] },
        ],
        activeTemplateId: "t1",
        theme: "system",
      },
    });
    await setupPageContextMock();

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("method-badge").textContent).toBe("GET");
    });

    // Change to non-existent value
    const select = document.getElementById("template-select");
    select.value = "non-existent";
    select.dispatchEvent(new Event("change"));

    // Wait for the change handler's loadStore() to resolve
    await vi.waitFor(() => {
      // loadStore is called (second call: first from init, second from change handler)
      expect(chrome.storage.local.get.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    // Should not crash, method badge should remain unchanged
    expect(document.getElementById("method-badge").textContent).toBe("GET");
  });
});

describe("explicit clipboard capture", () => {
  const template = { id: "t1", name: "Notes", url: "https://example.com", method: "POST", params: [{ key: "id", value: "{{send.id}}" }, { key: "text", value: "original" }] };
  const get = (id) => document.getElementById(id);
  beforeEach(async () => {
    vi.resetModules();
    setupPopupDOM();
    setupChromeMock({ hooky: { templates: [template], activeTemplateId: "t1" } });
    await setupPageContextMock();
    vi.stubGlobal("navigator", { clipboard: { readText: vi.fn().mockResolvedValue("  clipboard\n{{page.title}}  ") } });
    await import("../src/popup/popup.js");
    await vi.waitFor(() => expect(document.querySelectorAll(".param-item textarea")).toHaveLength(2));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("reads only after a click and fills the selected field without saving or sending", async () => {
    expect(get("paste-clipboard").disabled).toBe(true);
    expect(navigator.clipboard.readText).not.toHaveBeenCalled();
    get("paste-clipboard").dispatchEvent(new Event("click"));
    const fields = document.querySelectorAll("textarea");
    fields[1].focus();
    chrome.permissions.request.mockResolvedValue(true);
    get("paste-clipboard").click();
    expect(chrome.permissions.request).toHaveBeenCalledWith({ permissions: ["clipboardRead"] });
    get("paste-clipboard").dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(fields[1].value).toBe("  clipboard\n{{page.title}}  "));
    expect(fields[0].value).toBe("{{send.id}}");
    expect(navigator.clipboard.readText).toHaveBeenCalledOnce();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(get("popup-request-preview").textContent).toContain("clipboard\\n{{page.title}}");
  });

  it("keeps explicitly pasted text literal even when it matches the original variable preview", async () => {
    chrome.permissions.request.mockResolvedValue(true);
    navigator.clipboard.readText.mockResolvedValue("{{send.id}}");
    document.querySelector("textarea").focus();
    get("paste-clipboard").click();
    await vi.waitFor(() => expect(get("paste-clipboard").disabled).toBe(false));
    get("send-btn").click();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalled());
    expect(chrome.runtime.sendMessage.mock.calls[0][0].config.params[0]).toEqual({ key: "id", value: "{{send.id}}" });
  });

  it("preserves manual input after permission denial or read failure", async () => {
    const field = document.querySelector("textarea");
    field.focus();
    get("paste-clipboard").click();
    await vi.waitFor(() => expect(get("toast").textContent).toBe("clipboardDenied"));
    expect(navigator.clipboard.readText).not.toHaveBeenCalled();
    chrome.permissions.request.mockResolvedValue(true);
    navigator.clipboard.readText.mockRejectedValue(new Error("not focused"));
    get("paste-clipboard").click();
    await vi.waitFor(() => expect(get("toast").textContent).toBe("clipboardUnavailable"));
    expect(field.value).toBe("{{send.id}}");
    expect(get("paste-clipboard").disabled).toBe(false);
  });

  it("does not paste into a different field selected while reading", async () => {
    chrome.permissions.request.mockResolvedValue(true);
    let finish;
    navigator.clipboard.readText.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const fields = document.querySelectorAll("textarea");
    fields[0].focus();
    get("paste-clipboard").click();
    await vi.waitFor(() => expect(navigator.clipboard.readText).toHaveBeenCalled());
    fields[1].focus();
    finish("stale paste");
    await vi.waitFor(() => expect(get("paste-clipboard").disabled).toBe(false));
    expect(fields[0].value).toBe("{{send.id}}");
    expect(fields[1].value).toBe("original");
    get("params-preview").dispatchEvent(new Event("focusin"));
  });

  it("does not overwrite a newly selected template while awaiting clipboard permission", async () => {
    let grant;
    chrome.permissions.request.mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
    const field = document.querySelector("textarea");
    field.focus();
    get("paste-clipboard").click();
    get("template-select").dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(field.isConnected).toBe(false));
    grant(true);
    await vi.waitFor(() => expect(navigator.clipboard.readText).toHaveBeenCalled());
    expect(document.querySelector("textarea").value).toBe("{{send.id}}");
    expect(get("paste-clipboard").disabled).toBe(true);
  });
});
