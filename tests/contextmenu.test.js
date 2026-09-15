import { addFeedbackChrome } from "./chrome-mock.js";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the pagecontext module
vi.mock("../src/pagecontext.js", () => ({
  getPageContext: vi.fn(),
}));

import { buildContextMenus, handleContextMenuClick } from "../src/contextmenu.js";
import { getPageContext } from "../src/pagecontext.js";

describe("buildContextMenus", () => {
  let createMock;
  let removeAllMock;

  beforeEach(() => {
    createMock = vi.fn();
    removeAllMock = vi.fn().mockResolvedValue(undefined);

    global.chrome = {
      contextMenus: {
        create: createMock,
        removeAll: removeAllMock,
      },
      runtime: { lastError: null },
    };
    addFeedbackChrome(global.chrome);
  });

  it("should remove all existing menus before creating new ones", async () => {
    await buildContextMenus([]);
    expect(removeAllMock).toHaveBeenCalled();
  });

  it("keeps the panel and result actions available without templates", async () => {
    await buildContextMenus([]);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("should create parent menu and one child per template", async () => {
    const templates = [
      { id: "t1", name: "Slack", url: "https://slack.com/hook", method: "POST", params: [] },
      { id: "t2", name: "Discord", url: "https://discord.com/hook", method: "POST", params: [] },
    ];

    await buildContextMenus(templates);

    // Parent menu
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hooky-parent",
        title: "Hooky",
        contexts: ["page", "selection", "link", "image"],
      }),
    );

    // Child menus
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hooky-t1",
        parentId: "hooky-parent",
        title: "Slack",
        contexts: ["page", "selection", "link", "image"],
      }),
    );

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hooky-t2",
        parentId: "hooky-parent",
        title: "Discord",
        contexts: ["page", "selection", "link", "image"],
      }),
    );

    // Two action entries, parent, two templates and three panel entries.
    expect(createMock).toHaveBeenCalledTimes(8);
  });

  it("should use default name when template name is empty", async () => {
    const templates = [
      { id: "t1", name: "", url: "https://hook.com", method: "POST", params: [] },
    ];

    await buildContextMenus(templates);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hooky-t1",
        title: "Untitled",
      }),
    );
  });
});

describe("handleContextMenuClick", () => {
  let fetchMock;
  let storageMock;

  it("uses the selection captured by the context-menu event", async () => {
    storageMock.local.get.mockResolvedValue({ hooky: { templates: [{ id: "t1", name: "Save", url: "https://example.com/capture", method: "POST", params: [{ key: "text", value: "{{page.selection}}" }] }] } });
    getPageContext.mockResolvedValue({ page: { selection: "selection already changed", meta: {} } });
    await handleContextMenuClick({ menuItemId: "hooky-t1", selectionText: "original iframe selection" }, { id: 1, url: "https://example.com" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: "original iframe selection" });
  });

  it.each(["hooky-open-panel", "hooky-view-result", "hooky-menu-panel", "hooky-menu-result"])("opens %s without sending or evaluating rules", async (menuItemId) => {
    await handleContextMenuClick({ menuItemId }, { id: 1 });
    expect(chrome.action.openPopup).toHaveBeenCalledTimes(1);
    expect(storageMock.local.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

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
      storage: storageMock,
      action: {
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
      },
      contextMenus: {
        create: vi.fn(),
        removeAll: vi.fn().mockResolvedValue(undefined),
      },
      runtime: { lastError: null },
    };
    addFeedbackChrome(global.chrome);

    // Default: return fallback context
    getPageContext.mockResolvedValue({
      page: { url: "", title: "", selection: "", meta: {} },
    });
  });

  it("should ignore clicks on non-hooky menu items", async () => {
    const info = { menuItemId: "other-extension-menu" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should ignore clicks on the parent hooky menu item", async () => {
    const info = { menuItemId: "hooky-parent" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should execute webhook for matching template on click", async () => {
    const templates = [
      { id: "t1", name: "Slack", url: "https://slack.com/hook", method: "POST", params: [{ key: "url", value: "{{page.url}}" }] },
    ];
    storageMock.local.get.mockResolvedValue({
      hooky: { templates, activeTemplateId: "t1", theme: "system" },
    });

    getPageContext.mockResolvedValue({
      page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
    });

    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

    expect(getPageContext).toHaveBeenCalledWith(tab);
    expect(fetchMock).toHaveBeenCalledWith("https://slack.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({ url: "https://example.com" }),
    });
  });

  it("should show success badge after successful webhook", async () => {
    const templates = [
      { id: "t1", name: "Slack", url: "https://slack.com/hook", method: "POST", params: [] },
    ];
    storageMock.local.get.mockResolvedValue({
      hooky: { templates, activeTemplateId: "t1", theme: "system" },
    });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith(expect.objectContaining({ text: "✓" }));
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 1, color: "#4a9" });
  });

  it("should show error badge after failed webhook", async () => {
    const templates = [
      { id: "t1", name: "Slack", url: "https://slack.com/hook", method: "POST", params: [] },
    ];
    storageMock.local.get.mockResolvedValue({
      hooky: { templates, activeTemplateId: "t1", theme: "system" },
    });
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith(expect.objectContaining({ text: "✗" }));
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 1, color: "#c44" });
  });

  it("should do nothing when template id not found in store", async () => {
    storageMock.local.get.mockResolvedValue({
      hooky: { templates: [], activeTemplateId: null, theme: "system" },
    });

    const info = { menuItemId: "hooky-nonexistent" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should do nothing when template has no url", async () => {
    const templates = [
      { id: "t1", name: "Empty", url: "", method: "POST", params: [] },
    ];
    storageMock.local.get.mockResolvedValue({
      hooky: { templates, activeTemplateId: "t1", theme: "system" },
    });

    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should resolve template variables from page context", async () => {
    const templates = [
      {
        id: "t1", name: "Slack", url: "https://slack.com/hook", method: "POST",
        params: [{ key: "title", value: "{{page.title}}" }, { key: "selected", value: "{{page.selection}}" }],
      },
    ];
    storageMock.local.get.mockResolvedValue({
      hooky: { templates, activeTemplateId: "t1", theme: "system" },
    });

    getPageContext.mockResolvedValue({
      page: { url: "https://example.com", title: "My Page", selection: "highlighted text", meta: {} },
    });

    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "My Page" };

    await handleContextMenuClick(info, tab);

    expect(fetchMock).toHaveBeenCalledWith("https://slack.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({ title: "My Page", selected: "highlighted text" }),
    });
  });

  it("should use GET query params for GET method", async () => {
    const templates = [
      { id: "t1", name: "API", url: "https://api.com/hook", method: "GET", params: [{ key: "q", value: "{{page.url}}" }] },
    ];
    storageMock.local.get.mockResolvedValue({
      hooky: { templates, activeTemplateId: "t1", theme: "system" },
    });

    getPageContext.mockResolvedValue({
      page: { url: "https://example.com", title: "Example", selection: "", meta: {} },
    });

    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.com/hook?q=https%3A%2F%2Fexample.com",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("should handle tab without id in getPageContext", async () => {
    const templates = [
      { id: "t1", name: "Test", url: "https://hook.com", method: "POST", params: [{ key: "url", value: "{{page.url}}" }] },
    ];
    storageMock.local.get.mockResolvedValue({
      hooky: { templates, activeTemplateId: "t1", theme: "system" },
    });

    getPageContext.mockResolvedValue({
      page: { url: "chrome://extensions", title: "Extensions", selection: "", meta: {} },
    });

    const info = { menuItemId: "hooky-t1" };
    const tab = { url: "chrome://extensions", title: "Extensions" };

    await handleContextMenuClick(info, tab);

    expect(fetchMock).toHaveBeenCalledWith("https://hook.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({ url: "chrome://extensions" }),
    });
  });

  it("should handle fallback context from pagecontext module", async () => {
    const templates = [
      { id: "t1", name: "Test", url: "https://hook.com", method: "POST", params: [{ key: "title", value: "{{page.title}}" }] },
    ];
    storageMock.local.get.mockResolvedValue({
      hooky: { templates, activeTemplateId: "t1", theme: "system" },
    });

    getPageContext.mockResolvedValue({
      page: { url: "https://example.com", title: "Tab Title", selection: "", meta: {} },
    });

    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "Tab Title" };

    await handleContextMenuClick(info, tab);

    expect(fetchMock).toHaveBeenCalledWith("https://hook.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({ title: "Tab Title" }),
    });
  });

  it("should do nothing when store has no templates key", async () => {
    storageMock.local.get.mockResolvedValue({
      hooky: {},
    });

    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should handle tab with missing url and title", async () => {
    const templates = [
      { id: "t1", name: "Test", url: "https://hook.com", method: "POST", params: [{ key: "url", value: "{{page.url}}" }] },
    ];
    storageMock.local.get.mockResolvedValue({
      hooky: { templates, activeTemplateId: "t1", theme: "system" },
    });

    getPageContext.mockResolvedValue({
      page: { url: "", title: "", selection: "", meta: {} },
    });

    const info = { menuItemId: "hooky-t1" };
    const tab = {};

    await handleContextMenuClick(info, tab);

    expect(fetchMock).toHaveBeenCalledWith("https://hook.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({ url: "" }),
    });
  });
});
