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
  });

  it("should remove all existing menus before creating new ones", async () => {
    await buildContextMenus([]);
    expect(removeAllMock).toHaveBeenCalled();
  });

  it("should not create any menus when templates list is empty", async () => {
    await buildContextMenus([]);
    expect(createMock).not.toHaveBeenCalled();
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

    // 1 parent + 2 children = 3
    expect(createMock).toHaveBeenCalledTimes(3);
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

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✓" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#4a9" });
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

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✗" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#c44" });
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
      body: JSON.stringify({ url: "" }),
    });
  });
});
