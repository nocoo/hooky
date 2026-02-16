// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyI18n, t } from "../src/i18n.js";

describe("t", () => {
  beforeEach(() => {
    global.chrome = {
      i18n: {
        getMessage: vi.fn(),
      },
    };
  });

  it("should return translated message for a key", () => {
    chrome.i18n.getMessage.mockReturnValue("Saved!");
    expect(t("saved")).toBe("Saved!");
  });

  it("should pass substitutions to getMessage", () => {
    chrome.i18n.getMessage.mockReturnValue("Success (200)");
    expect(t("successStatus", ["200"])).toBe("Success (200)");
    expect(chrome.i18n.getMessage).toHaveBeenCalledWith(
      "successStatus",
      ["200"],
    );
  });

  it("should return key as fallback when message is empty", () => {
    chrome.i18n.getMessage.mockReturnValue("");
    expect(t("unknownKey")).toBe("unknownKey");
  });
});

describe("applyI18n", () => {
  beforeEach(() => {
    global.chrome = {
      i18n: {
        getMessage: vi.fn((key) => {
          const messages = {
            settingsTitle: "Hooky Settings",
            webhookUrlPlaceholder: "https://example.com/api/webhook",
            settingsTooltip: "Settings",
          };
          return messages[key] || "";
        }),
      },
    };
    document.body.innerHTML = "";
  });

  it("should set textContent for elements with data-i18n", () => {
    document.body.innerHTML = '<h1 data-i18n="settingsTitle">Fallback</h1>';
    applyI18n();
    expect(document.querySelector("h1").textContent).toBe("Hooky Settings");
  });

  it("should set placeholder for elements with data-i18n-placeholder", () => {
    document.body.innerHTML =
      '<input data-i18n-placeholder="webhookUrlPlaceholder" placeholder="old">';
    applyI18n();
    expect(document.querySelector("input").placeholder).toBe(
      "https://example.com/api/webhook",
    );
  });

  it("should set title for elements with data-i18n-title", () => {
    document.body.innerHTML =
      '<button data-i18n-title="settingsTooltip" title="old">X</button>';
    applyI18n();
    expect(document.querySelector("button").title).toBe("Settings");
  });

  it("should not overwrite content when message is empty", () => {
    document.body.innerHTML = '<p data-i18n="unknownKey">Keep me</p>';
    applyI18n();
    expect(document.querySelector("p").textContent).toBe("Keep me");
  });

  it("should not overwrite placeholder when message is empty", () => {
    document.body.innerHTML =
      '<input data-i18n-placeholder="unknownKey" placeholder="Keep me">';
    applyI18n();
    expect(document.querySelector("input").placeholder).toBe("Keep me");
  });

  it("should not overwrite title when message is empty", () => {
    document.body.innerHTML =
      '<button data-i18n-title="unknownKey" title="Keep me">X</button>';
    applyI18n();
    expect(document.querySelector("button").title).toBe("Keep me");
  });
});
