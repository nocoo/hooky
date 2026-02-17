import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock chrome APIs before importing background.js
const onMessageListeners = [];
const onChangedListeners = [];
const onClickedListeners = [];
const onMenuClickedListeners = [];

beforeEach(() => {
  onMessageListeners.length = 0;
  onChangedListeners.length = 0;
  onClickedListeners.length = 0;
  onMenuClickedListeners.length = 0;

  global.chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn((fn) => onMessageListeners.push(fn)),
      },
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
      },
      onChanged: {
        addListener: vi.fn((fn) => onChangedListeners.push(fn)),
      },
    },
    action: {
      onClicked: {
        addListener: vi.fn((fn) => onClickedListeners.push(fn)),
      },
      setPopup: vi.fn(),
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
      openPopup: vi.fn(),
    },
    contextMenus: {
      onClicked: {
        addListener: vi.fn((fn) => onMenuClickedListeners.push(fn)),
      },
      removeAll: vi.fn().mockResolvedValue(),
      create: vi.fn(),
    },
  };
});

// We need to dynamically import background.js so it picks up our mocks.
// But since module imports are cached, we use vi.resetModules() to force re-import.
async function loadBackground() {
  vi.resetModules();
  await import("../src/background.js");
}

describe("background.js", () => {
  it("should register chrome.runtime.onMessage listener", async () => {
    await loadBackground();
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledOnce();
    expect(onMessageListeners).toHaveLength(1);
  });

  it("should register chrome.storage.onChanged listener", async () => {
    await loadBackground();
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalledOnce();
    expect(onChangedListeners).toHaveLength(1);
  });

  it("should register chrome.action.onClicked listener", async () => {
    await loadBackground();
    expect(chrome.action.onClicked.addListener).toHaveBeenCalledOnce();
    expect(onClickedListeners).toHaveLength(1);
  });

  it("should register chrome.contextMenus.onClicked listener", async () => {
    await loadBackground();
    expect(chrome.contextMenus.onClicked.addListener).toHaveBeenCalledOnce();
    expect(onMenuClickedListeners).toHaveLength(1);
  });

  it("should build context menus on startup", async () => {
    chrome.storage.local.get.mockResolvedValue({
      hooky: {
        templates: [{ id: "t1", name: "Test", url: "https://x.com" }],
      },
    });
    await loadBackground();

    expect(chrome.storage.local.get).toHaveBeenCalledWith("hooky");
    expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
  });

  it("should not call setPopup on startup (popup always disabled)", async () => {
    chrome.storage.local.get.mockResolvedValue({
      hooky: {
        templates: [{ id: "t1", name: "Test", url: "https://x.com" }],
      },
    });
    await loadBackground();

    expect(chrome.action.setPopup).not.toHaveBeenCalled();
  });

  it("should handle EXECUTE_WEBHOOK message", async () => {
    await loadBackground();

    const listener = onMessageListeners[0];
    const sendResponse = vi.fn();

    // Mock fetch for executeWebhook
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = listener(
      {
        type: "EXECUTE_WEBHOOK",
        config: {
          url: "https://example.com/api",
          method: "POST",
          params: [{ key: "msg", value: "hi" }],
        },
        context: { page: {} },
      },
      {},
      sendResponse,
    );

    expect(result).toBe(true); // async response

    // Wait for the promise to resolve
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });

    delete global.fetch;
  });

  it("should ignore non-EXECUTE_WEBHOOK messages", async () => {
    await loadBackground();

    const listener = onMessageListeners[0];
    const sendResponse = vi.fn();

    const result = listener({ type: "OTHER" }, {}, sendResponse);

    expect(result).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it("should rebuild context menus on storage changes", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await loadBackground();

    // Reset mocks to track only the onChanged handler's calls
    chrome.contextMenus.removeAll.mockClear();

    const listener = onChangedListeners[0];
    listener({
      hooky: {
        newValue: {
          templates: [{ id: "a", name: "A", url: "https://a.com" }],
        },
      },
    });

    expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
  });

  it("should not call setPopup on storage changes (popup always disabled)", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await loadBackground();

    chrome.action.setPopup.mockClear();

    const listener = onChangedListeners[0];
    listener({
      hooky: {
        newValue: {
          templates: [{ id: "a", name: "A", url: "https://a.com" }],
        },
      },
    });

    expect(chrome.action.setPopup).not.toHaveBeenCalled();
  });

  it("should ignore storage changes without hooky key", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await loadBackground();

    chrome.contextMenus.removeAll.mockClear();

    const listener = onChangedListeners[0];
    listener({ otherKey: { newValue: {} } });

    expect(chrome.contextMenus.removeAll).not.toHaveBeenCalled();
  });

  it("should call handleQuickSend when action icon is clicked", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await loadBackground();

    const listener = onClickedListeners[0];
    const tab = { id: 1, url: "https://example.com", title: "Test" };

    // handleQuickSend will be called, which calls storage.local.get internally
    // Since store is empty, it will try to open popup
    chrome.action.openPopup.mockResolvedValue();
    listener(tab);

    // Give the async handleQuickSend time to execute
    await vi.waitFor(() => {
      expect(chrome.action.setPopup).toHaveBeenCalled();
    });
  });

  it("should call handleContextMenuClick when context menu is clicked", async () => {
    chrome.storage.local.get.mockResolvedValue({
      hooky: {
        templates: [{ id: "t1", name: "Test", url: "https://x.com", method: "POST", params: [] }],
      },
    });

    // Add scripting mock for getPageContext
    chrome.scripting = {
      executeScript: vi.fn().mockResolvedValue([{
        result: { url: "https://example.com", title: "Test", selection: "", meta: {} },
      }]),
    };

    await loadBackground();

    const listener = onMenuClickedListeners[0];
    const info = { menuItemId: "hooky-t1" };
    const tab = { id: 1, url: "https://example.com", title: "Test" };

    // Mock fetch for webhook execution
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    listener(info, tab);

    // Give async handleContextMenuClick time to execute
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    delete global.fetch;
  });
});
