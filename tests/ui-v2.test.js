// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { executeWebhook } from "../src/webhook.js";

const messages = JSON.parse(readFileSync("_locales/en/messages.json", "utf8"));
const get = (id) => document.getElementById(id);
const input = (id, value) => { get(id).value = value; get(id).dispatchEvent(new Event("input", { bubbles: true })); };
let data;
const rule = (id, value) => ({ id, field: "url", operator: "contains", value, templateId: "t1", enabled: true });

async function setup(overrides = {}, loadError) {
  data = { hooky: { templates: [{ id: "t1", name: "Reading list", url: "https://example.com/hook", method: "POST", params: [{ key: "title", value: "{{page.title}}" }] }], activeTemplateId: "t1", quickSendRules: [rule("r1", "github.com"), rule("r2", "example.com")], theme: "light", ...overrides } };
  document.body.innerHTML = readFileSync("src/options/options.html", "utf8").split("<body>")[1].split("<script")[0];
  vi.stubGlobal("chrome", { runtime: { getManifest: () => ({ version: "2.0.0" }) }, i18n: { getMessage: (key) => messages[key]?.message || key }, storage: { local: { get: vi.fn(async () => { if (loadError) throw loadError; return structuredClone(data); }), set: vi.fn(async (values) => Object.assign(data, structuredClone(values))) } } });
  await import("../src/options/options.js");
  if (loadError) { await vi.waitFor(() => expect(get("status").textContent).toBe(loadError.message)); return; }
  await vi.waitFor(() => expect(get("new-template")).not.toBeNull());
  if (data.hooky.templates.length) await vi.waitFor(() => expect(get("template-name").value).toBe(data.hooky.templates[0].name));
  else await vi.waitFor(() => expect(get("editor-empty").style.display).toBe("flex"));
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Hooky 2.0 workspace", () => {
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
    await vi.advanceTimersByTimeAsync(3100);
    expect(get("status").classList.contains("visible")).toBe(false);
  });
  it("shows a loading error without overwriting saved configuration", async () => {
    await setup({}, new Error("Storage unavailable"));
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
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
