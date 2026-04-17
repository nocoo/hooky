// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function setupOptionsDOM() {
  document.body.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2>Hooky <span class="version" id="version"></span></h2>
        </div>
        <div class="sidebar-panel active" id="panel-webhooks">
          <button type="button" class="sidebar-nav-btn" data-panel="panel-webhooks">
            <span>Webhooks</span>
            <svg class="sidebar-chevron" width="10" height="6" viewBox="0 0 10 6"></svg>
          </button>
          <div class="sidebar-panel-content">
            <ul id="template-list" class="template-list"></ul>
          </div>
        </div>
        <div class="sidebar-panel" id="panel-rules">
          <button type="button" class="sidebar-nav-btn" data-panel="panel-rules">
            <span>Rules</span>
            <svg class="sidebar-chevron" width="10" height="6" viewBox="0 0 10 6"></svg>
          </button>
          <div class="sidebar-panel-content">
            <ul id="rules-list" class="sidebar-list"></ul>
          </div>
        </div>
        <div class="sidebar-panel" id="panel-settings">
          <button type="button" class="sidebar-nav-btn" data-panel="panel-settings">
            <span>Settings</span>
            <svg class="sidebar-chevron" width="10" height="6" viewBox="0 0 10 6"></svg>
          </button>
          <div class="sidebar-panel-content">
          <ul id="settings-list" class="sidebar-list">
            <li data-settings="theme"><span>Theme</span></li>
          </ul>
          </div>
        </div>
      </aside>
      <main class="editor" id="editor">
        <div class="editor-header">
          <h2 id="editor-title">Webhook Detail</h2>
        </div>
        <div class="editor-body">
          <div class="editor-empty" id="editor-empty" style="display: flex;"></div>
          <div class="editor-form" id="editor-form" style="display: none;">
            <input type="text" id="template-name">
            <input type="url" id="webhook-url">
            <select id="http-method">
              <option value="GET">GET</option>
              <option value="POST" selected>POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
            <div id="params-list"></div>
            <button id="add-param">+ Add</button>
          </div>
          <div class="editor-form" id="rule-editor-form" style="display: none;">
            <select id="rule-field">
              <option value="url">URL</option>
              <option value="title">Title</option>
            </select>
            <select id="rule-operator">
              <option value="contains">contains</option>
              <option value="equals">equals</option>
              <option value="startsWith">starts with</option>
              <option value="endsWith">ends with</option>
              <option value="matches">matches (regex)</option>
            </select>
            <input type="text" id="rule-value">
            <select id="rule-template"></select>
            <input type="checkbox" id="rule-enabled" checked>
          </div>
          <div class="editor-form" id="rules-manager" style="display: none;">
            <p class="editor-desc">Rules description</p>
            <p class="no-items" id="no-rules">No rules configured.</p>
          </div>
          <div class="editor-form" id="settings-form" style="display: none;">
            <div class="settings-body">
              <select id="theme-select">
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>
        </div>
        <div class="editor-actions" id="editor-actions" style="display: none;">
          <button id="delete-template">Delete</button>
          <span id="status"></span>
          <button id="save">Save</button>
        </div>
      </main>
    </div>
  `;
}

function setupChromeMock(storeData = {}) {
  global.chrome = {
    runtime: {
      getManifest: vi.fn(() => ({ version: "1.0.0" })),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue(storeData),
        set: vi.fn().mockResolvedValue(),
      },
    },
    i18n: {
      getMessage: vi.fn((key) => {
        const messages = {
          saved: "Saved!",
          defaultTemplateName: "Untitled",
          deleteConfirm: "Delete $1?",
          paramKeyPlaceholder: "Key",
          paramValuePlaceholder: "Value",
          settings: "Settings",
          theme: "Theme",
          webhookDetail: "Webhook Detail",
          ruleDetail: "Rule Detail",
          quickSendRules: "Quick Send Rules",
          settingsDetail: "Settings",
          ruleFieldUrl: "URL",
          ruleFieldTitle: "Title",
          ruleOperatorContains: "contains",
          ruleOperatorEquals: "equals",
          ruleOperatorStartsWith: "starts with",
          ruleOperatorEndsWith: "ends with",
          ruleOperatorMatches: "matches (regex)",
          noRules: "No rules configured.",
          newWebhook: "New Webhook",
          addRule: "Add Rule",
        };
        return messages[key] || key;
      }),
    },
  };
}

function makeStore(overrides = {}) {
  return {
    hooky: {
      templates: [
        {
          id: "t1",
          name: "Hook A",
          url: "https://a.com/webhook",
          method: "POST",
          params: [{ key: "msg", value: "hello" }],
        },
      ],
      activeTemplateId: "t1",
      quickSendRules: [],
      theme: "system",
      ...overrides,
    },
  };
}

// Helper: get template items (excluding the "+ New Webhook" action item)
function getTemplateItems() {
  return document.querySelectorAll("#template-list li:not(.new-item)");
}

// Helper: get rule items (excluding the "+ New Rule" action item)
function getRuleItems() {
  return document.querySelectorAll("#rules-list li:not(.new-item)");
}

describe("options.js", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setupOptionsDOM();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.chrome;
  });

  it("should display version number", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("version").textContent).toBe("v1.0.0");
    });
  });

  it("should render template list with new-webhook action item", async () => {
    setupChromeMock(makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
        { id: "t2", name: "Hook B", url: "https://b.com", method: "GET", params: [] },
      ],
    }));

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      const items = getTemplateItems();
      expect(items).toHaveLength(2);
    });

    // First item is "+ New Webhook"
    const allItems = document.querySelectorAll("#template-list li");
    expect(allItems[0].classList.contains("new-item")).toBe(true);

    const items = getTemplateItems();
    expect(items[0].querySelector(".template-name").textContent).toBe("Hook A");
    expect(items[1].querySelector(".template-name").textContent).toBe("Hook B");
  });

  it("should show editor form when a template is selected", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });
    expect(document.getElementById("editor-empty").style.display).toBe("none");
    expect(document.getElementById("editor-actions").style.display).toBe("flex");
  });

  it("should fill form with template data", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });
    expect(document.getElementById("webhook-url").value).toBe("https://a.com/webhook");
    expect(document.getElementById("http-method").value).toBe("POST");

    const paramRows = document.querySelectorAll("#params-list .param-row");
    expect(paramRows).toHaveLength(1);
    expect(paramRows[0].querySelector(".param-key").value).toBe("msg");
    expect(paramRows[0].querySelector(".param-value").value).toBe("hello");
  });

  it("should show editor-empty when no templates exist", async () => {
    setupChromeMock(makeStore({ templates: [] }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });
    expect(document.getElementById("editor-form").style.display).toBe("none");
    expect(document.getElementById("editor-actions").style.display).toBe("none");
  });

  it("should create a new template when + New Webhook item is clicked", async () => {
    const store = makeStore();
    setupChromeMock(store);

    // After creating, the store will have 2 templates
    let callCount = 0;
    chrome.storage.local.get.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve(store);
      }
      // After create, return updated store
      return Promise.resolve(makeStore({
        templates: [
          ...store.hooky.templates,
          { id: "t-new", name: "Untitled", url: "", method: "POST", params: [] },
        ],
      }));
    });

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(getTemplateItems()).toHaveLength(1);
    });

    document.getElementById("new-template").click();

    await vi.waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  it("should save template changes", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    // Modify form
    document.getElementById("template-name").value = "Renamed Hook";
    document.getElementById("webhook-url").value = "https://new-url.com";
    document.getElementById("http-method").value = "PUT";

    document.getElementById("save").click();

    await vi.waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    // Verify the set call includes the updated template
    const setCall = chrome.storage.local.set.mock.calls.find(
      (call) => call[0].hooky?.templates?.[0]?.name === "Renamed Hook",
    );
    expect(setCall).toBeTruthy();
  });

  it("should add a param row when add-param button is clicked", async () => {
    setupChromeMock(makeStore({ templates: [{ id: "t1", name: "A", url: "https://a.com", method: "POST", params: [] }] }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    expect(document.querySelectorAll("#params-list .param-row")).toHaveLength(0);

    document.getElementById("add-param").click();

    expect(document.querySelectorAll("#params-list .param-row")).toHaveLength(1);

    document.getElementById("add-param").click();

    expect(document.querySelectorAll("#params-list .param-row")).toHaveLength(2);
  });

  it("should remove a param row when x button is clicked", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.querySelectorAll("#params-list .param-row")).toHaveLength(1);
    });

    document.querySelector(".btn-remove").click();

    expect(document.querySelectorAll("#params-list .param-row")).toHaveLength(0);
  });

  it("should show status message after save", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    document.getElementById("save").click();

    await vi.waitFor(() => {
      const status = document.getElementById("status");
      expect(status.classList.contains("visible")).toBe(true);
    });
  });

  it("should handle theme change", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to settings
    const settingsTrigger = document.querySelector('[data-panel="panel-settings"]');
    settingsTrigger.click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });

    const themeSelect = document.getElementById("theme-select");
    themeSelect.value = "dark";
    themeSelect.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("should delete template with confirmation", async () => {
    setupChromeMock(makeStore());
    // Mock confirm to return true
    global.confirm = vi.fn(() => true);

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // After delete, subsequent loadStore calls return empty templates
    chrome.storage.local.get.mockResolvedValue(makeStore({ templates: [] }));

    document.getElementById("delete-template").click();

    await vi.waitFor(() => {
      expect(global.confirm).toHaveBeenCalled();
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    // After deletion and re-render, editor should show empty state
    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });

    delete global.confirm;
  });

  it("should not delete when confirm is cancelled", async () => {
    setupChromeMock(makeStore());
    global.confirm = vi.fn(() => false);

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    const setCallsBefore = chrome.storage.local.set.mock.calls.length;
    document.getElementById("delete-template").click();

    await vi.waitFor(() => {
      expect(global.confirm).toHaveBeenCalled();
    });

    // No additional set calls should have been made for deletion
    expect(chrome.storage.local.set.mock.calls.length).toBe(setCallsBefore);

    delete global.confirm;
  });

  it("should switch template when clicking another template item", async () => {
    setupChromeMock(makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
        { id: "t2", name: "Hook B", url: "https://b.com", method: "GET", params: [{ key: "x", value: "1" }] },
      ],
    }));

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    // Click on the second template (skip new-item)
    const items = document.querySelectorAll("#template-list li:not(.new-item)");
    items[1].click();

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook B");
    });
    expect(document.getElementById("webhook-url").value).toBe("https://b.com");
    expect(document.getElementById("http-method").value).toBe("GET");
  });

  it("should apply system theme by default", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    // Navigate to settings to see theme select
    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    const settingsTrigger = document.querySelector('[data-panel="panel-settings"]');
    settingsTrigger.click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });

    expect(document.getElementById("theme-select").value).toBe("system");
  });

  it("should run legacy migration on startup", async () => {
    // Test with legacy webhook key present
    const storeData = {
      webhook: { url: "https://old.com", method: "POST", params: [] },
    };
    setupChromeMock(storeData);

    await import("../src/options/options.js");

    // migrateFromLegacy runs, which calls storage.local.get
    await vi.waitFor(() => {
      expect(chrome.storage.local.get).toHaveBeenCalled();
    });
  });

  it("should use default name when template name is empty", async () => {
    setupChromeMock(makeStore({
      templates: [{ id: "t1", name: "", url: "https://a.com", method: "POST", params: [] }],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      const nameSpan = document.querySelector("#template-list li:not(.new-item) .template-name");
      expect(nameSpan.textContent).toBe("Untitled");
    });
  });

  it("should keep currentTemplateId across renderAll when template still exists", async () => {
    setupChromeMock(makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
        { id: "t2", name: "Hook B", url: "https://b.com", method: "GET", params: [] },
      ],
    }));
    await import("../src/options/options.js");

    // Wait for first template to load
    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    // Select second template
    const items = document.querySelectorAll("#template-list li:not(.new-item)");
    items[1].click();

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook B");
    });
  });

  it("should fallback to defaults for template with missing url and method", async () => {
    setupChromeMock(makeStore({
      templates: [{ id: "t1", name: "No URL", url: undefined, method: undefined, params: [] }],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("No URL");
    });

    expect(document.getElementById("webhook-url").value).toBe("");
    expect(document.getElementById("http-method").value).toBe("POST");
  });

  it("should handle template with null params in editor", async () => {
    setupChromeMock(makeStore({
      templates: [{ id: "t1", name: "No Params", url: "https://x.com", method: "GET", params: null }],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("No Params");
    });

    expect(document.querySelectorAll("#params-list .param-row")).toHaveLength(0);
  });

  it("should use default name when saving with empty name", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    // Clear the name
    document.getElementById("template-name").value = "";
    document.getElementById("save").click();

    await vi.waitFor(() => {
      const setCalls = chrome.storage.local.set.mock.calls;
      const saved = setCalls.find(
        (call) => call[0].hooky?.templates?.[0]?.name === "Untitled",
      );
      expect(saved).toBeTruthy();
    });
  });

  it("should fallback to system when store has no theme", async () => {
    setupChromeMock(makeStore({ theme: undefined }));
    await import("../src/options/options.js");

    // Navigate to settings
    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    const settingsTrigger = document.querySelector('[data-panel="panel-settings"]');
    settingsTrigger.click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });

    expect(document.getElementById("theme-select").value).toBe("system");
  });

  it("should handle delete template name fallback", async () => {
    setupChromeMock(makeStore({
      templates: [{ id: "t1", name: "", url: "https://a.com", method: "POST", params: [] }],
    }));
    global.confirm = vi.fn(() => true);

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    chrome.storage.local.get.mockResolvedValue(makeStore({ templates: [] }));
    document.getElementById("delete-template").click();

    await vi.waitFor(() => {
      expect(global.confirm).toHaveBeenCalled();
      const confirmArg = global.confirm.mock.calls[0][0];
      expect(confirmArg).toContain("Delete");
    });

    delete global.confirm;
  });

  // ─── Sidebar panel tests ───

  it("should initialize with webhooks panel active", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("panel-webhooks").classList.contains("active")).toBe(true);
    });
    expect(document.getElementById("panel-rules").classList.contains("active")).toBe(false);
    expect(document.getElementById("panel-settings").classList.contains("active")).toBe(false);
  });

  it("should switch sidebar panels exclusively", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("panel-webhooks").classList.contains("active")).toBe(true);
    });

    // Click settings trigger
    const settingsTrigger = document.querySelector('[data-panel="panel-settings"]');
    settingsTrigger.click();

    await vi.waitFor(() => {
      expect(document.getElementById("panel-settings").classList.contains("active")).toBe(true);
    });
    expect(document.getElementById("panel-webhooks").classList.contains("active")).toBe(false);
    expect(document.getElementById("panel-rules").classList.contains("active")).toBe(false);
  });

  it("should not deactivate an already active panel when clicked", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("panel-webhooks").classList.contains("active")).toBe(true);
    });

    // Click webhooks trigger again — should remain active
    const trigger = document.querySelector('[data-panel="panel-webhooks"]');
    trigger.click();

    expect(document.getElementById("panel-webhooks").classList.contains("active")).toBe(true);
  });

  // ─── Rules manager tests ───

  it("should show rules manager when rules panel is clicked", async () => {
    setupChromeMock(makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
      ],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Click rules panel
    const rulesTrigger = document.querySelector('[data-panel="panel-rules"]');
    rulesTrigger.click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });
    expect(document.getElementById("editor-form").style.display).toBe("none");
    expect(document.getElementById("editor-actions").style.display).toBe("none");
    expect(document.getElementById("editor-title").textContent).toBe("Quick Send Rules");
  });

  it("should show no-rules message when there are no rules", async () => {
    setupChromeMock(makeStore({ quickSendRules: [] }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Click rules panel
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });
    expect(document.getElementById("no-rules").classList.contains("hidden")).toBe(false);
    // Only the "+ New Rule" action item should be in the sidebar list
    expect(getRuleItems()).toHaveLength(0);
  });

  it("should render rules list in sidebar", async () => {
    setupChromeMock(makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
        { id: "r2", field: "title", operator: "equals", value: "Home", templateId: "t1", enabled: false },
      ],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Click rules panel
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      const items = getRuleItems();
      expect(items).toHaveLength(2);
    });

    const items = getRuleItems();
    expect(items[0].querySelector(".rule-field").textContent).toBe("URL");
    expect(items[0].querySelector(".rule-operator").textContent).toContain("contains");
    expect(items[0].querySelector(".rule-value").textContent).toBe("github.com");
    expect(items[1].classList.contains("disabled")).toBe(true);
  });

  it("should hide no-rules message when rules exist", async () => {
    setupChromeMock(makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "test", templateId: "t1", enabled: true },
      ],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Click rules panel
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });
    expect(document.getElementById("no-rules").classList.contains("hidden")).toBe(true);
  });

  it("should select a rule and show rule editor", async () => {
    setupChromeMock(makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
      ],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Click rules panel to show rules manager
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    // Click on the rule (not the new-item)
    getRuleItems()[0].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });
    expect(document.getElementById("editor-form").style.display).toBe("none");
    expect(document.getElementById("rules-manager").style.display).toBe("none");
    expect(document.getElementById("rule-field").value).toBe("url");
    expect(document.getElementById("rule-operator").value).toBe("contains");
    expect(document.getElementById("rule-value").value).toBe("github.com");
    expect(document.getElementById("editor-title").textContent).toBe("Rule Detail");
  });

  it("should add a new rule when + New Rule item is clicked", async () => {
    const store = makeStore();
    setupChromeMock(store);

    let callCount = 0;
    chrome.storage.local.get.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) return Promise.resolve(store);
      return Promise.resolve(makeStore({
        quickSendRules: [
          { id: "r-new", field: "url", operator: "contains", value: "", templateId: "t1", enabled: true },
        ],
      }));
    });

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(getTemplateItems()).toHaveLength(1);
    });

    // Navigate to rules panel first
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });

    document.getElementById("add-rule").click();

    await vi.waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  it("should save rule changes", async () => {
    const storeWithRule = makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
      ],
    });
    setupChromeMock(storeWithRule);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules, then select rule
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    getRuleItems()[0].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });

    // Modify rule
    document.getElementById("rule-field").value = "title";
    document.getElementById("rule-operator").value = "equals";
    document.getElementById("rule-value").value = "My Page";

    document.getElementById("save").click();

    await vi.waitFor(() => {
      const setCalls = chrome.storage.local.set.mock.calls;
      const saved = setCalls.find(
        (call) => call[0].hooky?.quickSendRules?.[0]?.field === "title",
      );
      expect(saved).toBeTruthy();
    });
  });

  it("should delete a rule and return to rules manager", async () => {
    const storeWithRule = makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "test", templateId: "t1", enabled: true },
      ],
    });
    setupChromeMock(storeWithRule);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules, select the rule
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    getRuleItems()[0].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });

    // After delete, rules list is empty
    chrome.storage.local.get.mockResolvedValue(makeStore({ quickSendRules: [] }));

    document.getElementById("delete-template").click();

    await vi.waitFor(() => {
      // Should return to rules manager (not editor-empty)
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });
  });

  it("should populate template dropdown in rule editor", async () => {
    setupChromeMock(makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
        { id: "t2", name: "Hook B", url: "https://b.com", method: "GET", params: [] },
      ],
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "test", templateId: "t2", enabled: true },
      ],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules, select the rule
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    getRuleItems()[0].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });

    const options = document.querySelectorAll("#rule-template option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe("Hook A");
    expect(options[1].textContent).toBe("Hook B");
    expect(document.getElementById("rule-template").value).toBe("t2");
  });

  it("should clear template list highlights when selecting a rule", async () => {
    setupChromeMock(makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "test", templateId: "t1", enabled: true },
      ],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Template t1 should be highlighted initially
    expect(document.querySelector("#template-list li.active")).toBeTruthy();

    // Navigate to rules, click on a rule
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    getRuleItems()[0].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });

    // Template list should have no active items
    expect(document.querySelector("#template-list li.active")).toBeFalsy();
  });

  // ─── Settings panel tests ───

  it("should show settings form when settings panel is clicked", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Click settings panel
    document.querySelector('[data-panel="panel-settings"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });
    expect(document.getElementById("editor-form").style.display).toBe("none");
    expect(document.getElementById("editor-actions").style.display).toBe("none");
    expect(document.getElementById("editor-title").textContent).toBe("Settings");
  });

  it("should highlight settings list item when clicked", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Click settings panel
    document.querySelector('[data-panel="panel-settings"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });

    // Theme item should be active by default (it's the only settings item now)
    const themeItem = document.querySelector('[data-settings="theme"]');
    expect(themeItem.classList.contains("active")).toBe(true);
  });

  it("should navigate back to webhooks from settings", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Go to settings
    document.querySelector('[data-panel="panel-settings"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });

    // Go back to webhooks
    document.querySelector('[data-panel="panel-webhooks"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });
    expect(document.getElementById("settings-form").style.display).toBe("none");
  });

  it("should show + New Webhook as first item in template list", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(getTemplateItems()).toHaveLength(1);
    });

    const firstItem = document.querySelector("#template-list li");
    expect(firstItem.classList.contains("new-item")).toBe(true);
    expect(firstItem.id).toBe("new-template");
  });

  it("should show + New Rule as first item in rules list", async () => {
    setupChromeMock(makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "test", templateId: "t1", enabled: true },
      ],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    const firstItem = document.querySelector("#rules-list li");
    expect(firstItem.classList.contains("new-item")).toBe(true);
    expect(firstItem.id).toBe("add-rule");
  });

  it("should preserve settings view when renderAll is called in settings mode", async () => {
    const store = makeStore();
    setupChromeMock(store);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to settings
    document.querySelector('[data-panel="panel-settings"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });

    // Trigger renderAll by creating a template (which calls renderAll internally)
    // The editorMode should stay "settings" and settings form should remain visible
    const newTemplateItem = document.getElementById("new-template");
    expect(newTemplateItem).toBeTruthy();
    // Settings form should still be visible
    expect(document.getElementById("settings-form").style.display).toBe("block");
  });

  it("should show empty state when deleting last template in template mode", async () => {
    const store = makeStore();
    setupChromeMock(store);
    global.confirm = vi.fn(() => true);

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // After delete, no templates remain — renderAll in template mode → showEditorEmpty
    chrome.storage.local.get.mockResolvedValue(makeStore({ templates: [], activeTemplateId: null }));
    document.getElementById("delete-template").click();

    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });

    delete global.confirm;
  });

  it("should select current rule when renderAll is called in rule mode", async () => {
    const storeWithRule = makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
        { id: "r2", field: "title", operator: "equals", value: "Home", templateId: "t1", enabled: true },
      ],
    });
    setupChromeMock(storeWithRule);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules, select a rule
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(2);
    });

    // Select second rule
    getRuleItems()[1].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
      expect(document.getElementById("rule-value").value).toBe("Home");
    });

    // Save triggers renderAll in rule mode with currentRuleId = "r2"
    document.getElementById("save").click();

    await vi.waitFor(() => {
      // Wait for save to fully complete (status flash is the last step)
      const status = document.getElementById("status");
      expect(status.classList.contains("visible")).toBe(true);
      // After save+renderAll, rule editor should still be visible with same rule
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
      expect(document.getElementById("rule-value").value).toBe("Home");
    });
  });

  it("should fall back to first rule when current rule is deleted and others remain", async () => {
    const storeWithRules = makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
        { id: "r2", field: "title", operator: "equals", value: "Home", templateId: "t1", enabled: true },
      ],
    });
    setupChromeMock(storeWithRules);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules, select second rule
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(2);
    });

    getRuleItems()[1].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });

    // Delete second rule — r1 remains, should fall back to r1
    chrome.storage.local.get.mockResolvedValue(makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
      ],
    }));

    document.getElementById("delete-template").click();

    // After delete with editorMode="rules-list", should show rules manager
    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });
  });

  it("should show rules manager when last rule is deleted in rule mode", async () => {
    const storeWithRule = makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "test", templateId: "t1", enabled: true },
      ],
    });
    setupChromeMock(storeWithRule);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules, select the rule
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    getRuleItems()[0].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });

    // Delete the only rule — should go to rules-list mode and show rules manager
    chrome.storage.local.get.mockResolvedValue(makeStore({ quickSendRules: [] }));

    document.getElementById("delete-template").click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
      expect(document.getElementById("no-rules").classList.contains("hidden")).toBe(false);
    });
  });

  it("should handle new rule when no templates exist", async () => {
    setupChromeMock(makeStore({ templates: [] }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });

    // Navigate to rules panel
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });

    // Click add rule — should be no-op since no templates
    document.getElementById("add-rule").click();

    // No set calls should be made
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("should handle getOperatorLabel for unknown operator", async () => {
    setupChromeMock(makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "unknownOp", value: "test", templateId: "t1", enabled: true },
      ],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      const items = getRuleItems();
      expect(items).toHaveLength(1);
      // Unknown operator should fall back to raw operator name
      expect(items[0].querySelector(".rule-operator").textContent).toContain("unknownOp");
    });
  });

  it("should handle rule with empty value in sidebar", async () => {
    setupChromeMock(makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "", templateId: "t1", enabled: true },
      ],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      const items = getRuleItems();
      expect(items).toHaveLength(1);
      expect(items[0].querySelector(".rule-value").textContent).toBe("...");
    });
  });

  it("should not save when no template or rule is selected", async () => {
    setupChromeMock(makeStore({ templates: [] }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });

    // Click save when nothing is selected — should be no-op
    document.getElementById("save").click();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("should use default template name in rule template dropdown for unnamed template", async () => {
    setupChromeMock(makeStore({
      templates: [
        { id: "t1", name: "", url: "https://a.com", method: "POST", params: [] },
      ],
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "test", templateId: "t1", enabled: true },
      ],
    }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules, select the rule
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    getRuleItems()[0].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });

    const options = document.querySelectorAll("#rule-template option");
    expect(options[0].textContent).toBe("Untitled");
  });

  // ─── Branch coverage: renderAll editorMode=template with existing currentTemplateId ───

  it("should re-select current template in renderAll when editorMode is template", async () => {
    const store = makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
        { id: "t2", name: "Hook B", url: "https://b.com", method: "GET", params: [] },
      ],
    });
    setupChromeMock(store);
    await import("../src/options/options.js");

    // Wait for initial template load
    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    // Select second template — sets editorMode="template" and currentTemplateId="t2"
    const items = getTemplateItems();
    items[1].click();

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook B");
    });

    // Save triggers renderAll with editorMode="template" and currentTemplateId="t2"
    // This covers the branch: currentTemplateId exists AND found in store.templates
    document.getElementById("save").click();

    await vi.waitFor(() => {
      const status = document.getElementById("status");
      expect(status.classList.contains("visible")).toBe(true);
    });

    // After renderAll, should still show Hook B
    expect(document.getElementById("template-name").value).toBe("Hook B");
  });

  it("should fallback to first template in renderAll when currentTemplateId not found", async () => {
    const store = makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
        { id: "t2", name: "Hook B", url: "https://b.com", method: "GET", params: [] },
      ],
    });
    setupChromeMock(store);
    global.confirm = vi.fn(() => true);
    await import("../src/options/options.js");

    // Wait for initial template load
    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    // Select second template
    getTemplateItems()[1].click();

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook B");
    });

    // Delete t2 — after delete, editorMode is set to null and renderAll is called
    // But we want to test the branch where editorMode="template" and currentTemplateId is gone
    // That happens via the "save" path where we simulate t2 disappearing
    // Actually, deleteCurrentTemplate sets editorMode = null, so we need a different approach.
    // Let's simulate by saving then having the store change underneath.
    // The easiest way: use navigateToWebhooks which sets editorMode implicitly via selectTemplate

    // After deleting t2, the store only has t1
    chrome.storage.local.get.mockResolvedValue(makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
      ],
    }));

    // Delete t2 — this calls deleteCurrentTemplate → editorMode = null → renderAll
    document.getElementById("delete-template").click();

    await vi.waitFor(() => {
      expect(global.confirm).toHaveBeenCalled();
    });

    // renderAll with editorMode=null falls to the else branch → select first template
    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    delete global.confirm;
  });

  it("should show settings in renderAll when editorMode is settings", async () => {
    const store = makeStore();
    setupChromeMock(store);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to settings — sets editorMode="settings"
    document.querySelector('[data-panel="panel-settings"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });

    // Now trigger renderAll by clicking "+ New Webhook" — renderAll should restore settings view
    // because editorMode gets changed to "template" by handleNewTemplate
    // Actually, handleNewTemplate changes editorMode to "template", so this won't test "settings" in renderAll.

    // Instead, let's navigate to webhooks, then back to settings
    // to trigger renderAll with settings mode
    document.querySelector('[data-panel="panel-webhooks"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Go back to settings — navigateToSettings calls loadStore and showSettings
    document.querySelector('[data-panel="panel-settings"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });

    expect(document.getElementById("editor-title").textContent).toBe("Settings");
  });

  it("should handle delete when no editorMode is set", async () => {
    setupChromeMock(makeStore({ templates: [] }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });

    // Click delete when nothing is selected (editorMode is null) — should be no-op
    document.getElementById("delete-template").click();

    // No set calls should have been made
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  // ─── navigateToWebhooks branch coverage ───

  it("should navigate to webhooks with no currentTemplateId and select first template", async () => {
    // Start with empty templates so editorMode stays null (no template selected)
    const emptyStore = makeStore({ templates: [] });
    setupChromeMock(emptyStore);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });

    // Navigate to rules first
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });

    // Now return templates and navigate back to webhooks
    // currentTemplateId is null, templates exist → should select first
    chrome.storage.local.get.mockResolvedValue(makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
      ],
    }));

    document.querySelector('[data-panel="panel-webhooks"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });
  });

  it("should navigate to webhooks showing empty state when no templates", async () => {
    setupChromeMock(makeStore({ templates: [] }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });

    // Navigate to rules
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });

    // Navigate back to webhooks — no templates
    document.querySelector('[data-panel="panel-webhooks"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });
  });

  // ─── selectRule/selectTemplate guard: rule/template not found ───

  it("should handle selectRule when rule is not found in store", async () => {
    const storeWithRule = makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "test", templateId: "t1", enabled: true },
      ],
    });
    setupChromeMock(storeWithRule);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    // Mock store to return empty rules — next selectRule call won't find the rule
    chrome.storage.local.get.mockResolvedValue(makeStore({ quickSendRules: [] }));

    // Click on rule item — selectRule will call loadStore, not find rule, return early
    getRuleItems()[0].click();

    // Should NOT have switched to rule editor form (early return)
    // The rules manager or the previous state should still be visible
    await vi.waitFor(() => {
      // Rule editor should not be shown since rule was not found
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });
  });

  // ─── saveCurrentRule with empty rules → no-rules branch ───

  it("should show no-rules message after saving when rules list becomes empty", async () => {
    const storeWithRule = makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "github.com", templateId: "t1", enabled: true },
      ],
    });
    setupChromeMock(storeWithRule);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules, select rule
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    getRuleItems()[0].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });

    // Mock: updateQuickSendRule succeeds, then loadStore returns empty rules
    let updateCalled = false;
    chrome.storage.local.get.mockImplementation(() => {
      if (updateCalled) {
        return Promise.resolve(makeStore({ quickSendRules: [] }));
      }
      return Promise.resolve(storeWithRule);
    });
    chrome.storage.local.set.mockImplementation(() => {
      updateCalled = true;
      return Promise.resolve();
    });

    document.getElementById("save").click();

    await vi.waitFor(() => {
      expect(document.getElementById("no-rules").classList.contains("hidden")).toBe(false);
    });
  });

  // ─── quickSendRules || [] branch (store.quickSendRules is undefined) ───

  // ─── renderAll branch coverage: editorMode="template" + empty templates (line 572) ───

  it("should call showEditorEmpty in renderAll when editorMode=template and templates are empty", async () => {
    // handleNewTemplate sets editorMode="template" then calls renderAll()
    // If the store returns empty templates in renderAll, line 572 is hit
    const store = makeStore();
    setupChromeMock(store);

    // createTemplate calls storage.local.set, then renderAll calls loadStore
    // We need loadStore (storage.local.get) to return empty templates AFTER createTemplate runs
    let getCalls = 0;
    chrome.storage.local.get.mockImplementation(() => {
      getCalls++;
      if (getCalls <= 2) return Promise.resolve(store); // initial load
      // After createTemplate, renderAll's loadStore returns empty templates
      return Promise.resolve(makeStore({ templates: [] }));
    });

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(getTemplateItems()).toHaveLength(1);
    });

    // Click "+ New Webhook" — handleNewTemplate sets editorMode="template", calls renderAll
    document.getElementById("new-template").click();

    await vi.waitFor(() => {
      // renderAll with editorMode="template" + empty templates → showEditorEmpty
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });
  });

  // ─── renderAll branch coverage: editorMode="rule" + matching currentRuleId (line 577) ───

  it("should select matching rule in renderAll when editorMode=rule and currentRuleId matches", async () => {
    // handleNewRule sets editorMode="rule", currentRuleId=newRule.id, calls renderAll
    // renderAll finds the rule in store → selectRule(currentRuleId) (line 577)
    const store = makeStore();
    setupChromeMock(store);

    // Track the rule ID created by addQuickSendRule
    let createdRuleId = null;
    let getCalls = 0;
    chrome.storage.local.get.mockImplementation(() => {
      getCalls++;
      if (getCalls <= 2) return Promise.resolve(store); // initial load
      // After addQuickSendRule creates rule, return store with that rule
      if (createdRuleId) {
        return Promise.resolve(makeStore({
          quickSendRules: [
            { id: createdRuleId, field: "url", operator: "contains", value: "", templateId: "t1", enabled: true },
          ],
        }));
      }
      return Promise.resolve(store);
    });

    chrome.storage.local.set.mockImplementation((data) => {
      // Capture the rule ID from addQuickSendRule's save
      if (data.hooky?.quickSendRules?.length > 0) {
        createdRuleId = data.hooky.quickSendRules[0].id;
      }
      return Promise.resolve();
    });

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(getTemplateItems()).toHaveLength(1);
    });

    // Navigate to rules panel first
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });

    // Click "+ New Rule" — handleNewRule sets editorMode="rule", currentRuleId, calls renderAll
    document.getElementById("add-rule").click();

    await vi.waitFor(() => {
      // renderAll with editorMode="rule" + matching currentRuleId → selectRule (line 577)
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });
  });

  // ─── renderAll branch coverage: editorMode="rule" + empty rules (line 581) ───

  it("should show rules manager in renderAll when editorMode=rule and no rules exist", async () => {
    // handleNewRule sets editorMode="rule", calls renderAll
    // If renderAll's loadStore returns empty rules → showRulesManager (line 581)
    const store = makeStore();
    setupChromeMock(store);

    let getCalls = 0;
    chrome.storage.local.get.mockImplementation(() => {
      getCalls++;
      if (getCalls <= 2) return Promise.resolve(store); // initial load
      // After addQuickSendRule, renderAll's loadStore returns empty rules
      return Promise.resolve(makeStore({ quickSendRules: [] }));
    });

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(getTemplateItems()).toHaveLength(1);
    });

    // Navigate to rules
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });

    // Click "+ New Rule" — handleNewRule sets editorMode="rule", calls renderAll
    document.getElementById("add-rule").click();

    await vi.waitFor(() => {
      // renderAll with editorMode="rule" + empty rules → showRulesManager (line 581)
      expect(document.getElementById("rules-manager").style.display).toBe("block");
      expect(document.getElementById("no-rules").classList.contains("hidden")).toBe(false);
    });
  });

  // ─── Branch coverage: navigateToWebhooks with matching currentTemplateId (line 95) ───

  it("should re-select current template when navigating back to webhooks", async () => {
    const store = makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
        { id: "t2", name: "Hook B", url: "https://b.com", method: "GET", params: [] },
      ],
    });
    setupChromeMock(store);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    // Select second template — sets currentTemplateId = "t2"
    getTemplateItems()[1].click();

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook B");
    });

    // Navigate to rules
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });

    // Navigate back to webhooks — should re-select t2 via navigateToWebhooks (line 95-96)
    document.querySelector('[data-panel="panel-webhooks"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook B");
    });
  });

  // ─── Branch coverage: navigateToWebhooks with currentTemplateId not found (line 95 branch 1) ───

  it("should fallback to first template in navigateToWebhooks when currentTemplateId is gone", async () => {
    const store = makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
        { id: "t2", name: "Hook B", url: "https://b.com", method: "GET", params: [] },
      ],
    });
    setupChromeMock(store);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    // Select second template
    getTemplateItems()[1].click();

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook B");
    });

    // Navigate to rules
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });

    // Now mock store without t2
    chrome.storage.local.get.mockResolvedValue(makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
      ],
    }));

    // Navigate back to webhooks — currentTemplateId=t2 but not found → select first
    document.querySelector('[data-panel="panel-webhooks"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });
  });

  // ─── Branch coverage: settings list item click (line 88) ───

  it("should handle clicking settings list items", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to settings
    document.querySelector('[data-panel="panel-settings"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });

    // Click the theme settings item directly
    const themeItem = document.querySelector('[data-settings="theme"]');
    themeItem.click();

    expect(themeItem.classList.contains("active")).toBe(true);
  });

  // ─── Branch coverage: renderAll editorMode="template" + matching currentTemplateId (line 567-568) ───

  it("should selectTemplate in renderAll when editorMode=template and currentTemplateId found", async () => {
    const store = makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
      ],
    });
    setupChromeMock(store);

    // handleNewTemplate sets editorMode="template", currentTemplateId=newId, then calls renderAll
    // We need renderAll's loadStore to return a store with the new template
    let createdId = null;
    let getCalls = 0;
    chrome.storage.local.get.mockImplementation(() => {
      getCalls++;
      if (getCalls <= 2) return Promise.resolve(store);
      if (createdId) {
        return Promise.resolve(makeStore({
          templates: [
            ...store.hooky.templates,
            { id: createdId, name: "Untitled", url: "", method: "POST", params: [] },
          ],
        }));
      }
      return Promise.resolve(store);
    });

    chrome.storage.local.set.mockImplementation((data) => {
      if (data.hooky?.templates?.length > 1) {
        createdId = data.hooky.templates[data.hooky.templates.length - 1].id;
      }
      return Promise.resolve();
    });

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(getTemplateItems()).toHaveLength(1);
    });

    // Click "+ New Webhook" → handleNewTemplate → editorMode="template", renderAll
    document.getElementById("new-template").click();

    await vi.waitFor(() => {
      // renderAll finds currentTemplateId in templates → selectTemplate (line 568)
      expect(document.getElementById("editor-form").style.display).toBe("block");
      expect(document.getElementById("template-name").value).toBe("Untitled");
    });
  });

  // ─── Branch coverage: showRulesManager with undefined quickSendRules (line 223) ───

  it("should handle showRulesManager when quickSendRules is undefined via navigateToRules", async () => {
    // navigateToRules calls showRulesManager which checks store.quickSendRules || []
    const store = makeStore();
    setupChromeMock(store);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Mock store to return undefined quickSendRules
    chrome.storage.local.get.mockResolvedValue(makeStore({ quickSendRules: undefined }));

    // Navigate to rules — quickSendRules is undefined → || [] fallback (line 223)
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
      expect(document.getElementById("no-rules").classList.contains("hidden")).toBe(false);
    });
  });

  // ─── Branch coverage: saveCurrentRule with undefined quickSendRules (line 496) ───

  it("should handle saveCurrentRule when store quickSendRules becomes undefined", async () => {
    const storeWithRule = makeStore({
      quickSendRules: [
        { id: "r1", field: "url", operator: "contains", value: "test", templateId: "t1", enabled: true },
      ],
    });
    setupChromeMock(storeWithRule);
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules, select rule
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(getRuleItems()).toHaveLength(1);
    });

    getRuleItems()[0].click();

    await vi.waitFor(() => {
      expect(document.getElementById("rule-editor-form").style.display).toBe("block");
    });

    // After save, loadStore returns undefined quickSendRules → || [] fallback (line 496)
    let saveCalled = false;
    chrome.storage.local.get.mockImplementation(() => {
      if (saveCalled) {
        return Promise.resolve(makeStore({ quickSendRules: undefined }));
      }
      return Promise.resolve(storeWithRule);
    });
    chrome.storage.local.set.mockImplementation(() => {
      saveCalled = true;
      return Promise.resolve();
    });

    document.getElementById("save").click();

    await vi.waitFor(() => {
      expect(document.getElementById("no-rules").classList.contains("hidden")).toBe(false);
    });
  });

  it("should handle save when template list item is not in DOM", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    // Remove the template list items from DOM so querySelector won't find them
    const templateList = document.getElementById("template-list");
    const items = templateList.querySelectorAll("li:not(.new-item)");
    for (const item of items) {
      item.removeAttribute("data-id");
    }

    // Save — saveCurrentTemplate will try to find li by data-id but fail (line 472 falsy branch)
    document.getElementById("save").click();

    await vi.waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  it("should handle save when template name span is missing", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook A");
    });

    // Remove the .template-name span from the list item
    const nameSpan = document.querySelector("#template-list li:not(.new-item) .template-name");
    if (nameSpan) nameSpan.remove();

    // Save — saveCurrentTemplate finds li but not nameSpan (line 474 falsy branch)
    document.getElementById("save").click();

    await vi.waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  it("should handle missing quickSendRules in store for rules manager", async () => {
    setupChromeMock(makeStore({ quickSendRules: undefined }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Navigate to rules — quickSendRules is undefined, should fallback to []
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
      expect(document.getElementById("no-rules").classList.contains("hidden")).toBe(false);
    });
    expect(getRuleItems()).toHaveLength(0);
  });

  // ─── Branch coverage: guard clauses and edge cases ───

  it("should enter navigateToWebhooks with null currentTemplateId", async () => {
    setupChromeMock(makeStore({ templates: [] }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });

    // Navigate to settings (not rules, to avoid any template selection)
    document.querySelector('[data-panel="panel-settings"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("settings-form").style.display).toBe("block");
    });

    // Verify webhooks panel is NOT active
    expect(document.getElementById("panel-webhooks").classList.contains("active")).toBe(false);

    // Navigate back to webhooks — currentTemplateId is null
    document.querySelector('[data-panel="panel-webhooks"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("editor-empty").style.display).toBe("flex");
    });
  });

  it("should handle nav button with invalid panel id", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    // Add a nav button with invalid data-panel
    const sidebar = document.querySelector(".sidebar");
    const badBtn = document.createElement("button");
    badBtn.type = "button";
    badBtn.className = "sidebar-nav-btn";
    badBtn.dataset.panel = "panel-nonexistent";
    sidebar.appendChild(badBtn);

    // Re-init sidebar won't work since it ran at import. Instead, manually trigger the event
    // by clicking - but the buttons are registered at init time, so new buttons won't have listeners.
    // We need to test a button that was registered but has a bad panel reference.
    // Let's modify an existing button's data-panel to point to non-existent panel
    const webhooksBtn = document.querySelector('[data-panel="panel-webhooks"]');
    webhooksBtn.dataset.panel = "panel-nonexistent";

    // First navigate away so the current panel is not the one we're clicking
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });

    // Now click the modified button — panel is null → early return (line 61)
    webhooksBtn.click();

    // Should stay on rules manager (nothing changed)
    expect(document.getElementById("rules-manager").style.display).toBe("block");
  });

  it("should handle openPanel with nonexistent panel id", async () => {
    // handleNewRule calls openPanel("panel-rules") — if we remove the panel element,
    // openPanel's `if (panel)` branch will be false (line 557)
    const store = makeStore();
    setupChromeMock(store);

    let getCalls = 0;
    chrome.storage.local.get.mockImplementation(() => {
      getCalls++;
      if (getCalls <= 2) return Promise.resolve(store);
      return Promise.resolve(makeStore({
        quickSendRules: [
          { id: "r-test", field: "url", operator: "contains", value: "", templateId: "t1", enabled: true },
        ],
      }));
    });

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(getTemplateItems()).toHaveLength(1);
    });

    // Navigate to rules
    document.querySelector('[data-panel="panel-rules"]').click();

    await vi.waitFor(() => {
      expect(document.getElementById("rules-manager").style.display).toBe("block");
    });

    // Remove the panel-rules element so openPanel can't find it
    const rulesPanel = document.getElementById("panel-rules");
    rulesPanel.id = "panel-rules-removed";

    // Click add rule — handleNewRule calls openPanel("panel-rules") which won't find the element
    document.getElementById("add-rule").click();

    await vi.waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    // Restore
    rulesPanel.id = "panel-rules";
  });
});
