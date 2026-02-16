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

  it("should handle tab without id by using fallback context", async () => {
    const config = {
      url: "https://api.example.com/hook",
      method: "POST",
      params: [{ key: "url", value: "{{page.url}}" }],
    };
    storageMock.local.get.mockResolvedValue({ webhook: config });

    const tab = { url: "chrome://extensions", title: "Extensions" };
    await handleQuickSend(tab);

    expect(tabsMock.sendMessage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "chrome://extensions" }),
    });
  });
});
