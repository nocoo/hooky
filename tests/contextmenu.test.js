import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContextMenus, handleContextMenuClick } from "../src/contextmenu.js";

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
  let tabsMock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    storageMock = {
      local: {
        get: vi.fn(),
      },
    };
    tabsMock = {
      sendMessage: vi.fn(),
    };

    global.chrome = {
      storage: storageMock,
      tabs: tabsMock,
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
      hooky: { templates, activeTemplateId: "t1", quickSend: false, theme: "system" },
    });
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));

    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

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
      hooky: { templates, activeTemplateId: "t1", quickSend: false, theme: "system" },
    });
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));
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
      hooky: { templates, activeTemplateId: "t1", quickSend: false, theme: "system" },
    });
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "Example" };

    await handleContextMenuClick(info, tab);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✗" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#c44" });
  });

  it("should do nothing when template id not found in store", async () => {
    storageMock.local.get.mockResolvedValue({
      hooky: { templates: [], activeTemplateId: null, quickSend: false, theme: "system" },
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
      hooky: { templates, activeTemplateId: "t1", quickSend: false, theme: "system" },
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
      hooky: { templates, activeTemplateId: "t1", quickSend: false, theme: "system" },
    });

    const pageContext = {
      page: { url: "https://example.com", title: "My Page", selection: "highlighted text", meta: {} },
    };
    tabsMock.sendMessage.mockResolvedValue(pageContext);

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
      hooky: { templates, activeTemplateId: "t1", quickSend: false, theme: "system" },
    });
    tabsMock.sendMessage.mockRejectedValue(new Error("No content script"));

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
});
