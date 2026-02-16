import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPageContext } from "../src/pagecontext.js";

describe("getPageContext", () => {
  beforeEach(() => {
    global.chrome = {
      scripting: {
        executeScript: vi.fn(),
      },
    };
  });

  it("should return fallback when tab is null", async () => {
    const ctx = await getPageContext(null);
    expect(ctx).toEqual({
      page: { url: "", title: "", selection: "", meta: {} },
    });
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("should return fallback when tab is undefined", async () => {
    const ctx = await getPageContext(undefined);
    expect(ctx).toEqual({
      page: { url: "", title: "", selection: "", meta: {} },
    });
  });

  it("should return fallback when tab has no id", async () => {
    const tab = { url: "chrome://extensions", title: "Extensions" };
    const ctx = await getPageContext(tab);
    expect(ctx).toEqual({
      page: { url: "chrome://extensions", title: "Extensions", selection: "", meta: {} },
    });
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("should return fallback when tab has no id, url, or title", async () => {
    const ctx = await getPageContext({});
    expect(ctx).toEqual({
      page: { url: "", title: "", selection: "", meta: {} },
    });
  });

  it("should inject script and return result", async () => {
    const pageData = {
      page: {
        url: "https://example.com",
        title: "Example",
        selection: "hello",
        meta: { description: "A page" },
      },
    };
    chrome.scripting.executeScript.mockResolvedValue([{ result: pageData }]);

    const tab = { id: 42, url: "https://example.com", title: "Example" };
    const ctx = await getPageContext(tab);

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      func: expect.any(Function),
    });
    expect(ctx).toEqual(pageData);
  });

  it("should return fallback when executeScript returns null result", async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: null }]);

    const tab = { id: 1, url: "https://example.com", title: "Tab Title" };
    const ctx = await getPageContext(tab);

    expect(ctx).toEqual({
      page: { url: "https://example.com", title: "Tab Title", selection: "", meta: {} },
    });
  });

  it("should return fallback when executeScript returns empty array", async () => {
    chrome.scripting.executeScript.mockResolvedValue([]);

    const tab = { id: 1, url: "https://example.com", title: "Tab Title" };
    const ctx = await getPageContext(tab);

    expect(ctx).toEqual({
      page: { url: "https://example.com", title: "Tab Title", selection: "", meta: {} },
    });
  });

  it("should return fallback when executeScript returns null", async () => {
    chrome.scripting.executeScript.mockResolvedValue(null);

    const tab = { id: 1, url: "https://example.com", title: "Tab Title" };
    const ctx = await getPageContext(tab);

    expect(ctx).toEqual({
      page: { url: "https://example.com", title: "Tab Title", selection: "", meta: {} },
    });
  });

  it("should return fallback when executeScript throws", async () => {
    chrome.scripting.executeScript.mockRejectedValue(
      new Error("Cannot access chrome:// URLs"),
    );

    const tab = { id: 1, url: "chrome://settings", title: "Settings" };
    const ctx = await getPageContext(tab);

    expect(ctx).toEqual({
      page: { url: "chrome://settings", title: "Settings", selection: "", meta: {} },
    });
  });

  it("should pass extractPageContext as the func parameter", async () => {
    chrome.scripting.executeScript.mockResolvedValue([{
      result: { page: { url: "https://x.com", title: "X", selection: "", meta: {} } },
    }]);

    const tab = { id: 5, url: "https://x.com", title: "X" };
    await getPageContext(tab);

    const call = chrome.scripting.executeScript.mock.calls[0][0];
    expect(call.target).toEqual({ tabId: 5 });
    expect(typeof call.func).toBe("function");
    expect(call.func.name).toBe("extractPageContext");
  });
});
