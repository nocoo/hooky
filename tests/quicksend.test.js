import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleQuickSend, applyQuickSendMode } from "../src/quicksend.js";

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
  let sendMessageMock;
  let storageMock;
  let tabsMock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    sendMessageMock = vi.fn();
    storageMock = {
      local: {
        get: vi.fn(),
      },
    };
    tabsMock = {
      sendMessage: vi.fn(),
    };

    global.chrome = {
      runtime: {
        sendMessage: sendMessageMock,
      },
      storage: storageMock,
      tabs: tabsMock,
      action: {
        setPopup: vi.fn(),
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
      },
    };
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

  it("should execute webhook with page context from content script", async () => {
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
    tabsMock.sendMessage.mockResolvedValue(pageContext);

    const tab = { id: 1, url: "https://example.com/page", title: "Test Page" };
    await handleQuickSend(tab);

    expect(tabsMock.sendMessage).toHaveBeenCalledWith(1, {
      type: "GET_PAGE_CONTEXT",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/page" }),
    });
  });

  it("should fallback to tab info when content script fails", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [
        { key: "url", value: "{{page.url}}" },
        { key: "title", value: "{{page.title}}" },
      ],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));

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
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));
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
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));
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
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));
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
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));

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
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));

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
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));

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
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).toHaveBeenCalledWith("https://a.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("should handle tab without id (no content script possible)", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [{ key: "url", value: "{{page.url}}" }],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });

    // Tab with no id — e.g. some special pages
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

  it("should handle null response from content script", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [{ key: "title", value: "{{page.title}}" }],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });
    tabsMock.sendMessage.mockResolvedValue(null);

    const tab = { id: 1, url: "https://example.com", title: "Tab Title" };
    await handleQuickSend(tab);

    // Should fall back to tab info
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Tab Title" }),
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
});
