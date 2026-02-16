// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the pagecontext module before any imports
vi.mock("../src/pagecontext.js", () => ({
  getPageContext: vi.fn(),
}));

// Set up DOM structure that popup.js expects at import time
function setupPopupDOM() {
  document.body.innerHTML = `
    <div id="no-config" style="display: none;"></div>
    <div id="webhook-panel" style="display: none;">
      <select id="template-select"></select>
      <span id="method-badge">POST</span>
      <span id="url-display"></span>
      <div id="params-preview"></div>
      <button id="send-btn">Send</button>
    </div>
    <button id="settings-btn"></button>
    <button id="go-settings"></button>
    <div id="toast"></div>
  `;
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
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setupPopupDOM();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.chrome;
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
    expect(items[0].querySelector("input").value).toBe("https://example.com");
    expect(items[1].querySelector("input").value).toBe("static value");
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
    const input = document.querySelector(".param-item input");
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
    const input = document.querySelector(".param-item input");
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
