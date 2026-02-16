// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
      sendMessage: vi.fn().mockResolvedValue({
        page: {
          url: "https://example.com",
          title: "Example",
          selection: "",
          meta: {},
        },
      }),
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
    await import("../src/popup/popup.js");

    // Wait for init() to complete
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
    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      expect(document.getElementById("no-config").style.display).toBe("block");
    });

    document.getElementById("settings-btn").click();
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it("should open settings page when go-settings button is clicked", async () => {
    setupChromeMock({ hooky: { templates: [], theme: "system" } });
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

  it("should fallback to tab info when content script is unavailable", async () => {
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
    // Simulate content script not available
    chrome.tabs.sendMessage.mockRejectedValue(new Error("Could not establish connection"));

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

    await import("../src/popup/popup.js");

    await vi.waitFor(() => {
      const items = document.querySelectorAll(".param-item");
      expect(items).toHaveLength(1);
    });

    const item = document.querySelector(".param-item");
    expect(item.querySelector(".param-key").textContent).toBe("msg");
  });
});
