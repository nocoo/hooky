import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the pagecontext module
vi.mock("../src/pagecontext.js", () => ({
  getPageContext: vi.fn(),
}));

import { handleQuickSend, applyQuickSendMode } from "../src/quicksend.js";
import { getPageContext } from "../src/pagecontext.js";

describe("applyQuickSendMode", () => {
  let setPopupMock;

  beforeEach(() => {
    setPopupMock = vi.fn();
    global.chrome = {
      action: {
        setPopup: setPopupMock,
      },
    };
  });

  it("should disable popup when quickSend is enabled", () => {
    applyQuickSendMode(true);
    expect(setPopupMock).toHaveBeenCalledWith({ popup: "" });
  });

  it("should restore popup when quickSend is disabled", () => {
    applyQuickSendMode(false);
    expect(setPopupMock).toHaveBeenCalledWith({
      popup: "src/popup/popup.html",
    });
  });
});

describe("handleQuickSend", () => {
  let fetchMock;
  let storageMock;

  beforeEach(() => {
    vi.clearAllMocks();

    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    storageMock = {
      local: {
        get: vi.fn(),
      },
    };

    global.chrome = {
      runtime: {
        sendMessage: vi.fn(),
      },
      storage: storageMock,
      action: {
        setPopup: vi.fn(),
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
        openPopup: vi.fn(),
      },
    };

    // Default: return fallback context
    getPageContext.mockResolvedValue({
      page: { url: "", title: "", selection: "", meta: {} },
    });
  });

  it("should do nothing when no webhook config exists", async () => {
    storageMock.local.get.mockResolvedValue({});

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should do nothing when webhook url is empty", async () => {
    storageMock.local.get.mockResolvedValue({
      webhook: { url: "", method: "POST", params: [] },
    });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should execute webhook with page context from injected script", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [{ key: "url", value: "{{page.url}}" }],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });

    const pageContext = {
      page: {
        url: "https://example.com/page",
        title: "Test Page",
        selection: "",
        meta: { description: "A test page" },
      },
    };
    getPageContext.mockResolvedValue(pageContext);

    const tab = { id: 1, url: "https://example.com/page", title: "Test Page" };
    await handleQuickSend(tab);

    expect(getPageContext).toHaveBeenCalledWith(tab);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/page" }),
    });
  });

  it("should fallback to tab info when script injection fails", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [
        { key: "url", value: "{{page.url}}" },
        { key: "title", value: "{{page.title}}" },
      ],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });

    // getPageContext handles errors internally and returns fallback
    getPageContext.mockResolvedValue({
      page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
    });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        title: "Example",
      }),
    });
  });

  it("should show success badge on successful request", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✓" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#4a9",
    });
  });

  it("should show error badge on failed request", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✗" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#c44",
    });
  });

  it("should show error badge on network failure", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });
    fetchMock.mockRejectedValue(new Error("Network error"));

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✗" });
  });

  it("should handle GET method with query params in quick send", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "GET",
      params: [{ key: "page", value: "{{page.url}}" }],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });

    getPageContext.mockResolvedValue({
      page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
    });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/hook?page=https%3A%2F%2Fexample.com",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  it("should use quickSendTemplateId when set in new format", async () => {
    const store = {
      templates: [
        { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
        { id: "t2", name: "B", url: "https://b.com/hook", method: "POST", params: [] },
      ],
      activeTemplateId: "t1",
      quickSendTemplateId: "t2",
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).toHaveBeenCalledWith("https://b.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("should fall back to first template when quickSendTemplateId is null", async () => {
    const store = {
      templates: [
        { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
        { id: "t2", name: "B", url: "https://b.com/hook", method: "POST", params: [] },
      ],
      activeTemplateId: "t1",
      quickSendTemplateId: null,
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).toHaveBeenCalledWith("https://a.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("should fall back to first template when quickSendTemplateId references deleted template", async () => {
    const store = {
      templates: [
        { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
      ],
      activeTemplateId: "t1",
      quickSendTemplateId: "deleted-id",
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).toHaveBeenCalledWith("https://a.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("should handle tab without id (no script injection possible)", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [{ key: "url", value: "{{page.url}}" }],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });

    // getPageContext returns fallback when tab has no id
    getPageContext.mockResolvedValue({
      page: { url: "chrome://extensions", title: "Extensions", selection: "", meta: {} },
    });

    const tab = { url: "chrome://extensions", title: "Extensions" };
    await handleQuickSend(tab);

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "chrome://extensions" }),
    });
  });

  it("should handle null tab gracefully", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });

    await handleQuickSend(null);

    expect(getPageContext).toHaveBeenCalledWith(null);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("should handle tab with no url or title", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [{ key: "url", value: "{{page.url}}" }],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });

    const tab = { id: undefined };
    await handleQuickSend(tab);

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "" }),
    });
  });

  it("should do nothing when hooky store has empty templates", async () => {
    storageMock.local.get.mockResolvedValue({
      hooky: { templates: [] },
    });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should do nothing when hooky template has no url", async () => {
    storageMock.local.get.mockResolvedValue({
      hooky: {
        templates: [{ id: "t1", name: "No URL", url: "", method: "POST", params: [] }],
      },
    });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("quick send rules", () => {
    it("should use matching rule template instead of quickSendTemplateId", async () => {
      const store = {
        templates: [
          { id: "t1", name: "Discord", url: "https://discord.com/hook", method: "POST", params: [] },
          { id: "t2", name: "Slack", url: "https://slack.com/hook", method: "POST", params: [] },
        ],
        quickSendTemplateId: "t2",
        quickSendRules: [
          { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
        ],
      };
      storageMock.local.get.mockResolvedValue({ hooky: store });

      getPageContext.mockResolvedValue({
        page: { url: "https://github.com/nocoo/hooky", title: "Hooky", selection: "", meta: {} },
      });

      const tab = { id: 1, url: "https://github.com/nocoo/hooky", title: "Hooky" };
      await handleQuickSend(tab);

      expect(fetchMock).toHaveBeenCalledWith("https://discord.com/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    });

    it("should fall back to quickSendTemplateId when no rules match", async () => {
      const store = {
        templates: [
          { id: "t1", name: "Discord", url: "https://discord.com/hook", method: "POST", params: [] },
          { id: "t2", name: "Slack", url: "https://slack.com/hook", method: "POST", params: [] },
        ],
        quickSendTemplateId: "t2",
        quickSendRules: [
          { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
        ],
      };
      storageMock.local.get.mockResolvedValue({ hooky: store });

      getPageContext.mockResolvedValue({
        page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
      });

      const tab = { id: 1, url: "https://example.com", title: "Example" };
      await handleQuickSend(tab);

      expect(fetchMock).toHaveBeenCalledWith("https://slack.com/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    });

    it("should open popup when no rules match and no fallback template", async () => {
      const store = {
        templates: [
          { id: "t1", name: "Discord", url: "https://discord.com/hook", method: "POST", params: [] },
        ],
        quickSendTemplateId: null,
        quickSendRules: [
          { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
        ],
      };
      storageMock.local.get.mockResolvedValue({ hooky: store });

      getPageContext.mockResolvedValue({
        page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
      });

      const tab = { id: 1, url: "https://example.com", title: "Example" };
      await handleQuickSend(tab);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(chrome.action.setPopup).toHaveBeenCalledWith({ popup: "src/popup/popup.html" });
      expect(chrome.action.openPopup).toHaveBeenCalled();
    });

    it("should skip disabled rules and fall back", async () => {
      const store = {
        templates: [
          { id: "t1", name: "Discord", url: "https://discord.com/hook", method: "POST", params: [] },
          { id: "t2", name: "Slack", url: "https://slack.com/hook", method: "POST", params: [] },
        ],
        quickSendTemplateId: "t2",
        quickSendRules: [
          { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: false },
        ],
      };
      storageMock.local.get.mockResolvedValue({ hooky: store });

      getPageContext.mockResolvedValue({
        page: { url: "https://github.com/nocoo/hooky", title: "Hooky", selection: "", meta: {} },
      });

      const tab = { id: 1, url: "https://github.com/nocoo/hooky", title: "Hooky" };
      await handleQuickSend(tab);

      // Rule is disabled, so falls back to quickSendTemplateId (t2 = Slack)
      expect(fetchMock).toHaveBeenCalledWith("https://slack.com/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    });

    it("should match by title field", async () => {
      const store = {
        templates: [
          { id: "t1", name: "Discord", url: "https://discord.com/hook", method: "POST", params: [] },
        ],
        quickSendTemplateId: null,
        quickSendRules: [
          { id: "r1", field: "title", operator: "contains", value: "Pull Request", templateId: "t1", enabled: true },
        ],
      };
      storageMock.local.get.mockResolvedValue({ hooky: store });

      getPageContext.mockResolvedValue({
        page: { url: "https://github.com/x/y/pull/1", title: "My Pull Request #1", selection: "", meta: {} },
      });

      const tab = { id: 1, url: "https://github.com/x/y/pull/1", title: "My Pull Request #1" };
      await handleQuickSend(tab);

      expect(fetchMock).toHaveBeenCalledWith("https://discord.com/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    });

    it("should use first matching rule when multiple rules match", async () => {
      const store = {
        templates: [
          { id: "t1", name: "Discord", url: "https://discord.com/hook", method: "POST", params: [] },
          { id: "t2", name: "Slack", url: "https://slack.com/hook", method: "POST", params: [] },
        ],
        quickSendTemplateId: null,
        quickSendRules: [
          { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
          { id: "r2", field: "url", operator: "contains", value: "github", templateId: "t2", enabled: true },
        ],
      };
      storageMock.local.get.mockResolvedValue({ hooky: store });

      getPageContext.mockResolvedValue({
        page: { url: "https://github.com/test", title: "Test", selection: "", meta: {} },
      });

      const tab = { id: 1, url: "https://github.com/test", title: "Test" };
      await handleQuickSend(tab);

      expect(fetchMock).toHaveBeenCalledWith("https://discord.com/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    });

    it("should skip rule when its template was deleted", async () => {
      const store = {
        templates: [
          { id: "t2", name: "Slack", url: "https://slack.com/hook", method: "POST", params: [] },
        ],
        quickSendTemplateId: "t2",
        quickSendRules: [
          { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "deleted-id", enabled: true },
        ],
      };
      storageMock.local.get.mockResolvedValue({ hooky: store });

      getPageContext.mockResolvedValue({
        page: { url: "https://github.com/test", title: "Test", selection: "", meta: {} },
      });

      const tab = { id: 1, url: "https://github.com/test", title: "Test" };
      await handleQuickSend(tab);

      // Rule matched but template doesn't exist, fall back to quickSendTemplateId
      expect(fetchMock).toHaveBeenCalledWith("https://slack.com/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    });

    it("should work with empty rules array (backward compatible)", async () => {
      const store = {
        templates: [
          { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
        ],
        quickSendTemplateId: "t1",
        quickSendRules: [],
      };
      storageMock.local.get.mockResolvedValue({ hooky: store });

      const tab = { id: 1, url: "https://example.com", title: "Example" };
      await handleQuickSend(tab);

      expect(fetchMock).toHaveBeenCalledWith("https://a.com/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    });

    it("should work without quickSendRules field (backward compatible)", async () => {
      const store = {
        templates: [
          { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
        ],
        quickSendTemplateId: "t1",
        // no quickSendRules field at all
      };
      storageMock.local.get.mockResolvedValue({ hooky: store });

      const tab = { id: 1, url: "https://example.com", title: "Example" };
      await handleQuickSend(tab);

      expect(fetchMock).toHaveBeenCalledWith("https://a.com/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    });

    it("should restore quick send mode after popup fallback", async () => {
      const store = {
        templates: [
          { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
        ],
        quickSendTemplateId: null,
        quickSendRules: [
          { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
        ],
        quickSend: true,
      };
      storageMock.local.get.mockResolvedValue({ hooky: store });

      getPageContext.mockResolvedValue({
        page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
      });

      const tab = { id: 1, url: "https://example.com", title: "Example" };
      await handleQuickSend(tab);

      // Should open popup temporarily
      expect(chrome.action.setPopup).toHaveBeenCalledWith({ popup: "src/popup/popup.html" });
      expect(chrome.action.openPopup).toHaveBeenCalled();
    });
  });
});
