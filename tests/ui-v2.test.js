// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { executeWebhook } from "../src/webhook.js";

const messages = JSON.parse(readFileSync("_locales/en/messages.json", "utf8"));
const get = (id) => document.getElementById(id);
const input = (id, value) => { get(id).value = value; get(id).dispatchEvent(new Event("input", { bubbles: true })); };
let data;
let windowListeners;
const rule = (id, value) => ({ id, field: "url", operator: "contains", value, templateId: "t1", enabled: true });

async function setup(overrides = {}, loadError) {
  data = { hooky: { templates: [{ id: "t1", name: "Reading list", url: "https://example.com/hook", method: "POST", params: [{ key: "title", value: "{{page.title}}" }] }], activeTemplateId: "t1", quickSendRules: [rule("r1", "github.com"), rule("r2", "example.com")], theme: "light", ...overrides } };
  document.body.innerHTML = readFileSync("src/options/options.html", "utf8").split("<body>")[1].split("<script")[0];
  vi.stubGlobal("chrome", { runtime: { getManifest: () => ({ version: "2.0.0" }) }, permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn().mockResolvedValue(false), onRemoved: { addListener: vi.fn() }, onAdded: { addListener: vi.fn() } }, i18n: { getMessage: (key) => messages[key]?.message || key }, storage: { local: { get: vi.fn(async () => { if (loadError) throw loadError; return structuredClone(data); }), set: vi.fn(async (values) => Object.assign(data, structuredClone(values))) } } });
  await import("../src/options/options.js");
  if (loadError) { await vi.waitFor(() => expect(get("status").textContent).toBe(loadError.message)); return; }
  await vi.waitFor(() => expect(get("new-template")).not.toBeNull());
  if (data.hooky.templates.length) await vi.waitFor(() => expect(get("template-name").value).toBe(data.hooky.templates[0].name));
  else await vi.waitFor(() => expect(get("editor-empty").style.display).toBe("flex"));
}

beforeEach(() => { vi.resetModules(); windowListeners = vi.spyOn(window, "addEventListener"); });
afterEach(() => {
  for (const [type, listener, options] of windowListeners.mock.calls) window.removeEventListener(type, listener, options);
  windowListeners.mockRestore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Hooky 2.0 workspace", () => {
  it("preserves collapsed advanced settings and never carries credentials into a new template", async () => {
    const original = { id: "t1", name: "Private", url: "https://example.com", method: "POST", params: [], headers: [{ key: "Authorization", value: "Bearer private-key" }], response: { enabled: true, receiptPath: "data.id", successPath: "saved", successValue: "true" }, duplicateWindow: 30 };
    await setup({ templates: [original] });
    expect(get("template-advanced").open).toBe(false);
    input("template-name", "Renamed");
    get("save").click();
    await vi.waitFor(() => expect(data.hooky.templates[0].name).toBe("Renamed"));
    expect(data.hooky.templates[0]).toMatchObject({ headers: original.headers, response: original.response, duplicateWindow: 30 });
    get("new-template").click();
    await vi.waitFor(() => expect(data.hooky.templates).toHaveLength(2));
    await vi.waitFor(() => expect(get("webhook-url").value).toBe(""));
    expect(get("headers-list").children).toHaveLength(0);
    expect(get("read-response").checked).toBe(false);
    expect(get("response-id-path").value).toBe("");
    expect(get("duplicate-protection").checked).toBe(false);
    input("webhook-url", "https://public.example");
    get("save").click();
    await vi.waitFor(() => expect(data.hooky.templates[1].url).toBe("https://public.example"));
    expect(data.hooky.templates[1]).toMatchObject({ headers: [], response: { enabled: false }, duplicateWindow: 0 });
  });

  it("keeps completed duplicate protection off by default and validates its window", async () => {
    await setup();
    expect(get("duplicate-protection").checked).toBe(false);
    expect(get("duplicate-window").disabled).toBe(true);
    get("duplicate-protection").checked = true;
    get("duplicate-protection").dispatchEvent(new Event("change"));
    expect(get("duplicate-window").disabled).toBe(false);
    input("duplicate-window", "0");
    get("save").click();
    await vi.waitFor(() => expect(get("save").disabled).toBe(false));
    expect(data.hooky.templates[0].duplicateWindow).toBeUndefined();
    input("duplicate-window", "15");
    get("save").click();
    await vi.waitFor(() => expect(data.hooky.templates[0].duplicateWindow).toBe(15));
    get("duplicate-protection").checked = false;
    get("duplicate-protection").dispatchEvent(new Event("change"));
    expect(get("duplicate-window").disabled).toBe(true);
    document.querySelector('#template-list [data-id="t1"]').click();
    await vi.waitFor(() => expect(get("duplicate-protection").checked).toBe(true));
    expect(get("duplicate-window").value).toBe("15");
  });

  it("saves optional JSON field mappings and validates a business success rule", async () => {
    await setup();
    expect(get("response-fields").disabled).toBe(true);
    get("read-response").checked = true;
    get("read-response").dispatchEvent(new Event("change"));
    expect(get("response-fields").disabled).toBe(false);
    input("response-message-path", "data.message");
    input("response-id-path", "data.id");
    input("response-success-path", "saved");
    input("response-success-value", "ok");
    expect(get("request-preview").textContent).toBe(messages.invalidSuccessValue.message);
    get("save").click();
    await vi.waitFor(() => expect(get("status").textContent).toBe(messages.invalidSuccessValue.message));
    input("response-success-value", '"ok"');
    get("save").click();
    await vi.waitFor(() => expect(data.hooky.templates[0].response).toEqual({ enabled: true, messagePath: "data.message", receiptPath: "data.id", successPath: "saved", successValue: '"ok"' }));
    get("read-response").checked = false;
    get("read-response").dispatchEvent(new Event("change"));
    expect(get("response-fields").disabled).toBe(true);
    document.querySelector('#template-list [data-id="t1"]').click();
    await vi.waitFor(() => expect(get("read-response").checked).toBe(true));
    expect(get("response-id-path").value).toBe("data.id");
    expect(get("response-success-value").value).toBe('"ok"');
  });

  it("leaves response reading off for existing templates and saves an explicit opt-in", async () => {
    await setup();
    expect(get("read-response").checked).toBe(false);
    get("read-response").checked = true;
    get("save").click();
    await vi.waitFor(() => expect(data.hooky.templates[0].response).toEqual({ enabled: true }));
    get("read-response").checked = false;
    document.querySelector('#template-list [data-id="t1"]').click();
    await vi.waitFor(() => expect(get("read-response").checked).toBe(true));
  });

  it("edits per-template headers, masks previews and resets the reveal control", async () => {
    await setup();
    expect(get("template-advanced").open).toBe(false);
    get("add-header").click();
    const key = document.querySelector(".header-key");
    const value = document.querySelector(".header-value");
    key.value = "Authorization";
    value.value = "Bearer secret-token";
    value.dispatchEvent(new Event("input", { bubbles: true }));
    expect(value.type).toBe("password");
    expect(get("request-preview").textContent).toContain("authorization: ••••");
    expect(get("request-preview").textContent).not.toContain("secret-token");
    get("show-header-values").checked = true;
    get("show-header-values").dispatchEvent(new Event("change"));
    expect(value.type).toBe("text");
    get("add-header").click();
    const keys = document.querySelectorAll(".header-key");
    const values = document.querySelectorAll(".header-value");
    expect(values[1].type).toBe("text");
    keys[1].value = "Idempotency-Key";
    values[1].focus();
    document.querySelector('[data-variable="{{send.id}}"]') .click();
    expect(values[1].value).toBe("{{send.id}}");
    get("show-header-values").checked = false;
    get("show-header-values").dispatchEvent(new Event("change"));
    expect(value.type).toBe("password");
    get("save").click();
    await vi.waitFor(() => expect(data.hooky.templates[0].headers).toEqual([
      { key: "Authorization", value: "Bearer secret-token" }, { key: "Idempotency-Key", value: "{{send.id}}" },
    ]));
    document.querySelector('#template-list [data-id="t1"]').click();
    await vi.waitFor(() => expect(document.querySelector(".header-value")).not.toBe(value));
    expect(document.querySelector(".header-value").type).toBe("password");
    document.querySelector("#headers-list .btn-remove").click();
    expect(get("request-preview").textContent).not.toContain("authorization");
  });

  it("explains header validation errors in both preview and save", async () => {
    await setup();
    get("add-header").click();
    const key = document.querySelector(".header-key");
    key.value = "Content-Type";
    key.dispatchEvent(new Event("input", { bubbles: true }));
    expect(get("request-preview").textContent).toBe(messages.managedHeader.message);
    get("save").click();
    await vi.waitFor(() => expect(get("status").textContent).toBe(messages.managedHeader.message));
    expect(data.hooky.templates[0].headers).toBeUndefined();
  });

  it("shows the real method and body preview and preserves multiline values on save", async () => {
    await setup();
    expect(get("request-preview").textContent).toContain('"title": "{{page.title}}"');
    const value = document.querySelector(".param-value");
    value.value = "  first line\nsecond line  ";
    value.dispatchEvent(new Event("input", { bubbles: true }));
    get("save").click();
    await vi.waitFor(() => expect(data.hooky.templates[0].params[0].value).toBe("  first line\nsecond line  "));
    input("http-method", "GET");
    expect(get("request-preview").textContent).toContain("?title=%20%20first%20line%0Asecond%20line%20%20");
    input("http-method", "DELETE");
    expect(get("request-preview").textContent.startsWith("DELETE ")).toBe(true);
  });
  it("inserts a variable at the cursor and creates a value field if none is selected", async () => {
    await setup({ templates: [{ id: "t1", name: "Empty", url: "", method: "POST", params: [] }] });
    document.querySelector('[data-variable="{{page.url}}"]') .click();
    const value = document.querySelector(".param-value");
    expect(value.value).toBe("{{page.url}}");
    value.value = "Before after";
    value.focus();
    value.setSelectionRange(7, 7);
    document.querySelector('[data-variable="{{page.title}}"]') .click();
    expect(value.value).toBe("Before {{page.title}}after");
    document.querySelector(".btn-remove").click();
    expect(get("request-preview").textContent).toContain("{}");
    document.querySelector('[data-variable="{{page.selection}}"]') .click();
    expect(document.querySelector(".param-value").value).toBe("{{page.selection}}");
  });
  it("supports keyboard navigation and the empty-state create action", async () => {
    await setup({ templates: [], quickSendRules: [] });
    get("empty-new-template").click();
    await vi.waitFor(() => expect(data.hooky.templates).toHaveLength(1));
    await vi.waitFor(() => expect(get("editor-form").style.display).toBe("block"));
    const item = document.querySelector("#template-list li[data-id]");
    item.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    item.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    item.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(item.tabIndex).toBe(0);
  });
  it("tests a rule without sending anything and changes priority without losing unsaved edits", async () => {
    await setup();
    document.querySelector('[data-panel="panel-rules"]').click();
    await vi.waitFor(() => expect(get("rules-manager").style.display).toBe("block"));
    document.querySelector('#rules-list [data-id="r1"]').click();
    await vi.waitFor(() => expect(get("rule-value").value).toBe("github.com"));
    input("rule-sample", "https://github.com/nocoo/hooky");
    get("test-rule").click();
    expect(get("rule-test-result").textContent).toBe(messages.ruleMatches.message);
    input("rule-sample", "https://example.org");
    get("test-rule").click();
    expect(get("rule-test-result").textContent).toBe(messages.ruleNoMatch.message);
    input("rule-value", "unsaved.example");
    get("rule-down").click();
    await vi.waitFor(() => expect(data.hooky.quickSendRules.map((item) => item.id)).toEqual(["r2", "r1"]));
    expect(get("rule-value").value).toBe("unsaved.example");
    get("rule-up").click();
    await vi.waitFor(() => expect(data.hooky.quickSendRules.map((item) => item.id)).toEqual(["r1", "r2"]));
  });
  it("validates regex and saves enabled state", async () => {
    await setup();
    document.querySelector('[data-panel="panel-rules"]').click();
    await vi.waitFor(() => expect(document.querySelector('#rules-list [data-id="r1"]')).not.toBeNull());
    document.querySelector('#rules-list [data-id="r1"]').click();
    await vi.waitFor(() => expect(get("rule-editor-form").style.display).toBe("block"));
    input("rule-operator", "matches");
    input("rule-value", "[");
    get("save").click();
    await vi.waitFor(() => { expect(get("status").textContent).toBe(messages.invalidRegex.message); expect(get("save").disabled).toBe(false); });
    expect(data.hooky.quickSendRules[0].operator).toBe("contains");
    input("rule-value", "^https://github\\.com");
    get("rule-enabled").checked = false;
    get("save").click();
    await vi.waitFor(() => expect(data.hooky.quickSendRules[0].enabled).toBe(false));
  });
  it("explains why a rule cannot be created without a template", async () => {
    await setup({ templates: [], quickSendRules: [] });
    document.querySelector('[data-panel="panel-rules"]').click();
    await vi.waitFor(() => expect(get("rules-manager").style.display).toBe("block"));
    get("empty-add-rule").click();
    await vi.waitFor(() => expect(get("no-rules").textContent).toBe(messages.createTemplateFirst.message));
  });
  it("rejects invalid endpoint input and reports failed saves", async () => {
    await setup();
    input("webhook-url", "invalid-url");
    get("save").click();
    expect(data.hooky.templates[0].url).toBe("https://example.com/hook");
    await vi.waitFor(() => expect(get("save").disabled).toBe(false));
    input("webhook-url", "https://example.com/new");
    chrome.storage.local.set.mockRejectedValueOnce(new Error("Storage full"));
    get("save").click();
    await vi.waitFor(() => expect(get("status").textContent).toBe("Storage full"));
    expect(get("save").disabled).toBe(false);
  });
});

describe("edited popup payloads", () => {
  it.each(["POST", "PUT", "PATCH", "GET", "DELETE"])("preserves literal variables and multiline values for %s", async (method) => {
    const value = "  copied {{page.title}}\nsecond line  ";
    const send = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", send);
    await executeWebhook({ url: "https://example.com/webhook", method, params: [{ key: "note", value }] }, { page: {} }, true);
    const [url, options] = send.mock.calls[0];
    if (method === "GET" || method === "DELETE") expect(new URL(url).searchParams.get("note")).toBe(value);
    else expect(JSON.parse(options.body).note).toBe(value);
  });
});


describe("workspace feedback and failures", () => {
  it("defers success dismissal during interaction, then closes on focus or pointer leave", async () => {
    await setup();
    vi.useFakeTimers();
    const notice = get("settings-feedback");
    const interacting = vi.spyOn(notice, "matches").mockReturnValue(true);
    get("save").click();
    await vi.waitFor(() => expect(notice.hidden).toBe(false));
    notice.dispatchEvent(new Event("pointerleave"));
    await vi.advanceTimersByTimeAsync(8100);
    expect(notice.hidden).toBe(false);
    notice.dispatchEvent(new Event("focusout"));
    await vi.advanceTimersByTimeAsync(0);
    expect(notice.hidden).toBe(false);
    interacting.mockReturnValue(false);
    notice.dispatchEvent(new Event("focusout"));
    await vi.advanceTimersByTimeAsync(0);
    expect(notice.hidden).toBe(true);
    get("save").click();
    await vi.waitFor(() => expect(notice.hidden).toBe(false));
    interacting.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(8100);
    interacting.mockReturnValue(false);
    notice.dispatchEvent(new Event("pointerleave"));
    expect(notice.hidden).toBe(true);
  });

  it("keeps failed saves visible until dismissed and clears success when editing resumes", async () => {
    await setup();
    vi.useFakeTimers();
    chrome.storage.local.set.mockRejectedValueOnce(new Error("Storage full"));
    get("save").click();
    await vi.waitFor(() => expect(get("status").textContent).toBe("Storage full"));
    expect(get("settings-feedback").hidden).toBe(false);
    expect(get("status").getAttribute("role")).toBe("alert");
    await vi.advanceTimersByTimeAsync(30000);
    expect(get("settings-feedback").hidden).toBe(false);
    get("dismiss-status").click();
    expect(get("settings-feedback").hidden).toBe(true);

    get("save").click();
    await vi.waitFor(() => expect(get("status").textContent).toBe(messages.saved.message));
    expect(get("status").getAttribute("role")).toBe("status");
    expect(get("settings-feedback").classList.contains("error")).toBe(false);
    expect(get("save").hasAttribute("aria-busy")).toBe(false);
    input("template-name", "Another edit");
    expect(get("settings-feedback").hidden).toBe(true);
    chrome.storage.local.set.mockRejectedValueOnce(new Error("Still full"));
    get("save").click();
    await vi.waitFor(() => expect(get("status").textContent).toBe("Still full"));
    input("template-name", "Correcting the failed draft");
    expect(get("settings-feedback").hidden).toBe(true);
    expect(data.hooky.templates[0].name).toBe("Reading list");
  });

  it.each(["light", "system"])("reports a failed theme save and restores the %s preference", async (theme) => {
    await setup({ theme });
    document.querySelector('[data-panel="panel-settings"]').click();
    await vi.waitFor(() => expect(get("settings-form").style.display).toBe("block"));
    chrome.storage.local.set.mockRejectedValueOnce(new Error("Theme not saved"));
    get("theme-select").value = "dark";
    get("theme-select").dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(get("status").textContent).toBe("Theme not saved"));
    expect(get("theme-select").value).toBe(theme);
    expect(get("theme-select").disabled).toBe(false);
    expect(data.hooky.theme).toBe(theme);
    expect(get("settings-feedback").hidden).toBe(false);
    get("theme-select").value = "dark";
    get("theme-select").dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(data.hooky.theme).toBe("dark"));
    expect(get("status").textContent).toBe(messages.saved.message);
  });

  it("shows revoked notification permission without losing the preference and restores it on a gesture", async () => {
    await setup({ notificationMode: "all" });
    chrome.permissions.contains.mockResolvedValue(false);
    document.querySelector('[data-panel="panel-settings"]').click();
    await vi.waitFor(() => expect(get("notification-permission").hidden).toBe(false));
    expect(get("notification-mode").value).toBe("all");
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    chrome.permissions.request.mockImplementation(async () => { chrome.permissions.contains.mockResolvedValue(true); return true; });
    get("grant-notification-permission").click();
    expect(chrome.permissions.request).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(get("notification-permission").hidden).toBe(true));
    expect(data.hooky.notificationMode).toBe("all");
    chrome.permissions.contains.mockResolvedValue(false);
    chrome.permissions.onRemoved.addListener.mock.calls[0][0]();
    await vi.waitFor(() => expect(get("notification-permission").hidden).toBe(false));
    chrome.permissions.contains.mockResolvedValue(true);
    chrome.permissions.onAdded.addListener.mock.calls[0][0]();
    await vi.waitFor(() => expect(get("notification-permission").hidden).toBe(true));
  });

  it("ignores stale permission checks and handles unavailable permission APIs", async () => {
    await setup({ notificationMode: "errors" });
    document.querySelector('[data-panel="panel-settings"]').click();
    await vi.waitFor(() => expect(get("notification-mode").value).toBe("errors"));
    let finish;
    chrome.permissions.contains.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    window.dispatchEvent(new Event("focus"));
    get("notification-mode").value = "off";
    get("notification-mode").dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(data.hooky.notificationMode).toBe("off"));
    finish(false);
    await Promise.resolve();
    expect(get("notification-permission").hidden).toBe(true);
    chrome.permissions.request.mockResolvedValue(true);
    chrome.permissions.contains.mockRejectedValue(new Error("unavailable"));
    get("notification-mode").value = "errors";
    get("notification-mode").dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(get("notification-permission").hidden).toBe(false));
  });

  it("requests notifications only on an explicit setting change and handles denial", async () => {
    await setup();
    chrome.permissions.request.mockResolvedValue(false);
    document.querySelector('[data-panel="panel-settings"]').click();
    await vi.waitFor(() => expect(get("settings-form").style.display).toBe("block"));
    expect(get("notification-mode").value).toBe("off");
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    get("notification-mode").value = "all";
    get("notification-mode").dispatchEvent(new Event("change"));
    expect(chrome.permissions.request).toHaveBeenCalledWith({ permissions: ["notifications"] });
    await vi.waitFor(() => expect(get("status").textContent).toBe(messages.notificationDenied.message));
    expect(get("notification-mode").value).toBe("off");
    expect(data.hooky.notificationMode).toBeUndefined();
    chrome.permissions.request.mockResolvedValue(true);
    get("notification-mode").value = "errors";
    get("notification-mode").dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(data.hooky.notificationMode).toBe("errors"));
    expect(get("status").textContent).toBe(messages.saved.message);
    chrome.permissions.request.mockClear();
    get("notification-mode").value = "off";
    get("notification-mode").dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(data.hooky.notificationMode).toBe("off"));
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  it("preserves the existing notification preference when saving fails", async () => {
    await setup({ notificationMode: "all" });
    document.querySelector('[data-panel="panel-settings"]').click();
    await vi.waitFor(() => expect(get("notification-mode").value).toBe("all"));
    chrome.storage.local.set.mockRejectedValue(new Error("Storage unavailable"));
    get("notification-mode").value = "off";
    get("notification-mode").dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(get("status").textContent).toBe("Storage unavailable"));
    expect(get("notification-mode").value).toBe("all");
    expect(get("notification-mode").disabled).toBe(false);
  });

  it("preserves selection when returning from settings and clears save feedback", async () => {
    await setup();
    document.querySelector('[data-panel="panel-settings"]').click();
    await vi.waitFor(() => expect(get("settings-form").style.display).toBe("block"));
    document.querySelector('[data-panel="panel-webhooks"]').click();
    await vi.waitFor(() => expect(get("editor-form").style.display).toBe("block"));
    await vi.waitFor(() => expect(get("template-name").value).toBe("Reading list"));
    vi.useFakeTimers();
    get("save").click();
    await vi.waitFor(() => expect(get("status").classList.contains("visible")).toBe(true));
    await vi.advanceTimersByTimeAsync(8100);
    expect(get("status").classList.contains("visible")).toBe(false);
  });
  it("shows a loading error without overwriting saved configuration", async () => {
    await setup({}, new Error("Storage unavailable"));
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(get("settings-feedback").hidden).toBe(false);
    expect(get("empty-new-template")).not.toBeNull();
  });
  it.each(["rule-up", "rule-down"])("reports a failed priority change from %s", async (id) => {
    await setup();
    document.querySelector('[data-panel="panel-rules"]').click();
    await vi.waitFor(() => expect(document.querySelector('#rules-list [data-id="r1"]')).not.toBeNull());
    document.querySelector(`#rules-list [data-id="${id === "rule-up" ? "r2" : "r1"}"]`).click();
    await vi.waitFor(() => expect(get(id).disabled).toBe(false));
    chrome.storage.local.set.mockRejectedValueOnce(new Error("Priority not saved"));
    get(id).click();
    await vi.waitFor(() => expect(get("status").textContent).toBe("Priority not saved"));
  });
});
