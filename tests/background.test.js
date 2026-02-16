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

  it("should load store and apply quick send mode on startup", async () => {
    chrome.storage.local.get.mockResolvedValue({
      hooky: {
        quickSend: true,
        templates: [{ id: "t1", name: "Test", url: "https://x.com" }],
      },
    });
    await loadBackground();

    expect(chrome.storage.local.get).toHaveBeenCalledWith("hooky");
    // applyQuickSendMode(true) should set popup to ""
    expect(chrome.action.setPopup).toHaveBeenCalledWith({ popup: "" });
    // buildContextMenus should be called with templates
    expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
  });

  it("should apply quick send mode=false when store has quickSend=false", async () => {
    chrome.storage.local.get.mockResolvedValue({
      hooky: {
        quickSend: false,
        templates: [],
      },
    });
    await loadBackground();

    expect(chrome.action.setPopup).toHaveBeenCalledWith({
      popup: "src/popup/popup.html",
    });
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

  it("should react to storage changes for hooky key", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await loadBackground();

    // Reset mocks to track only the onChanged handler's calls
    chrome.action.setPopup.mockClear();
    chrome.contextMenus.removeAll.mockClear();

    const listener = onChangedListeners[0];
    listener({
      hooky: {
        newValue: {
          quickSend: true,
          templates: [{ id: "a", name: "A", url: "https://a.com" }],
        },
      },
    });

    expect(chrome.action.setPopup).toHaveBeenCalledWith({ popup: "" });
    expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
  });

  it("should ignore storage changes without hooky key", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await loadBackground();

    chrome.action.setPopup.mockClear();

    const listener = onChangedListeners[0];
    listener({ otherKey: { newValue: {} } });

    expect(chrome.action.setPopup).not.toHaveBeenCalled();
  });
});
