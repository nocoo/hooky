import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the pagecontext module
vi.mock("../src/pagecontext.js", () => ({
  getPageContext: vi.fn(),
}));

import { handleQuickSend } from "../src/quicksend.js";
import { getPageContext } from "../src/pagecontext.js";

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

  it("should open popup when no store exists", async () => {
    storageMock.local.get.mockResolvedValue({});

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(chrome.action.setPopup).toHaveBeenCalledWith({ popup: "src/popup/popup.html" });
    expect(chrome.action.openPopup).toHaveBeenCalled();
  });

  it("should open popup when store has empty templates", async () => {
    storageMock.local.get.mockResolvedValue({
      hooky: { templates: [] },
    });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(chrome.action.openPopup).toHaveBeenCalled();
  });

  it("should open popup when no rules match", async () => {
    const store = {
      templates: [
        { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
      ],
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

  it("should open popup when no rules exist", async () => {
    const store = {
      templates: [
        { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
      ],
      quickSendRules: [],
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(chrome.action.openPopup).toHaveBeenCalled();
  });

  it("should open popup when quickSendRules field is missing", async () => {
    const store = {
      templates: [
        { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
      ],
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(chrome.action.openPopup).toHaveBeenCalled();
  });

  it("should execute webhook when rule matches", async () => {
    const store = {
      templates: [
        { id: "t1", name: "Discord", url: "https://discord.com/hook", method: "POST", params: [] },
      ],
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

  it("should show success badge on successful request", async () => {
    const store = {
      templates: [
        { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
      ],
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "example.com", templateId: "t1", enabled: true },
      ],
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    getPageContext.mockResolvedValue({
      page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
    });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✓" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#4a9",
    });
  });

  it("should show error badge on failed request", async () => {
    const store = {
      templates: [
        { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
      ],
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "example.com", templateId: "t1", enabled: true },
      ],
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    getPageContext.mockResolvedValue({
      page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
    });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✗" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#c44",
    });
  });

  it("should show error badge on network failure", async () => {
    const store = {
      templates: [
        { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
      ],
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "example.com", templateId: "t1", enabled: true },
      ],
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });
    fetchMock.mockRejectedValue(new Error("Network error"));

    getPageContext.mockResolvedValue({
      page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
    });

    const tab = { id: 1, url: "https://example.com", title: "Example" };
    await handleQuickSend(tab);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✗" });
  });

  it("should match by title field", async () => {
    const store = {
      templates: [
        { id: "t1", name: "Discord", url: "https://discord.com/hook", method: "POST", params: [] },
      ],
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

  it("should skip disabled rules and open popup", async () => {
    const store = {
      templates: [
        { id: "t1", name: "Discord", url: "https://discord.com/hook", method: "POST", params: [] },
      ],
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

    // Rule is disabled, no match → open popup
    expect(fetchMock).not.toHaveBeenCalled();
    expect(chrome.action.openPopup).toHaveBeenCalled();
  });

  it("should open popup when matched rule's template was deleted", async () => {
    const store = {
      templates: [
        { id: "t2", name: "Slack", url: "https://slack.com/hook", method: "POST", params: [] },
      ],
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

    // Rule matched but template doesn't exist → open popup
    expect(fetchMock).not.toHaveBeenCalled();
    expect(chrome.action.openPopup).toHaveBeenCalled();
  });

  it("should open popup when matched template has no URL", async () => {
    const store = {
      templates: [
        { id: "t1", name: "Empty", url: "", method: "POST", params: [] },
      ],
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
      ],
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });

    getPageContext.mockResolvedValue({
      page: { url: "https://github.com/test", title: "Test", selection: "", meta: {} },
    });

    const tab = { id: 1, url: "https://github.com/test", title: "Test" };
    await handleQuickSend(tab);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(chrome.action.openPopup).toHaveBeenCalled();
  });

  it("should execute webhook with page context and template params", async () => {
    const store = {
      templates: [
        {
          id: "t1", name: "A", url: "https://api.example.com/hook", method: "POST",
          params: [{ key: "url", value: "{{page.url}}" }],
        },
      ],
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "example.com", templateId: "t1", enabled: true },
      ],
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });

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

  it("should handle GET method with query params", async () => {
    const store = {
      templates: [
        {
          id: "t1", name: "A", url: "https://api.example.com/hook", method: "GET",
          params: [{ key: "page", value: "{{page.url}}" }],
        },
      ],
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "example.com", templateId: "t1", enabled: true },
      ],
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });

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

  it("should handle null tab gracefully", async () => {
    const store = {
      templates: [
        { id: "t1", name: "A", url: "https://a.com/hook", method: "POST", params: [] },
      ],
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "", templateId: "t1", enabled: true },
      ],
    };
    storageMock.local.get.mockResolvedValue({ hooky: store });

    getPageContext.mockResolvedValue({
      page: { url: "", title: "", selection: "", meta: {} },
    });

    await handleQuickSend(null);

    expect(getPageContext).toHaveBeenCalledWith(null);
  });
});
