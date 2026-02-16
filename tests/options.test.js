// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function setupOptionsDOM() {
  document.body.innerHTML = `
    <ul id="template-list"></ul>
    <button id="new-template">+</button>
    <input type="checkbox" id="quick-send">
    <p id="quick-send-hint"></p>
    <select id="theme-select">
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
    <div id="editor-empty" style="display: flex;"></div>
    <div id="editor-form" style="display: none;">
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
      <input type="checkbox" id="editor-quick-send">
    </div>
    <div id="editor-actions" style="display: none;">
      <button id="delete-template">Delete</button>
      <span id="status"></span>
      <button id="save">Save</button>
    </div>
    <span id="version"></span>
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
          quickSendTarget: "Set as quick send",
          quickSendTargetActive: "Quick send active",
          settings: "Settings",
          theme: "Theme",
          quickSend: "Quick Send",
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
      quickSend: false,
      quickSendTemplateId: null,
      theme: "system",
      ...overrides,
    },
  };
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

  it("should render template list", async () => {
    setupChromeMock(makeStore({
      templates: [
        { id: "t1", name: "Hook A", url: "https://a.com", method: "POST", params: [] },
        { id: "t2", name: "Hook B", url: "https://b.com", method: "GET", params: [] },
      ],
    }));

    await import("../src/options/options.js");

    await vi.waitFor(() => {
      const items = document.querySelectorAll("#template-list li");
      expect(items).toHaveLength(2);
    });

    const items = document.querySelectorAll("#template-list li");
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

  it("should create a new template when + button is clicked", async () => {
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
      expect(document.querySelectorAll("#template-list li")).toHaveLength(1);
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

  it("should remove a param row when × button is clicked", async () => {
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

  it("should toggle quick send hint visibility", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    const toggle = document.getElementById("quick-send");
    const hint = document.getElementById("quick-send-hint");

    expect(hint.classList.contains("visible")).toBe(false);

    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(hint.classList.contains("visible")).toBe(true);
    });
  });

  it("should handle theme change", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
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
    // (There may be set calls from init, but no new ones for delete)
    expect(chrome.storage.local.set.mock.calls.length).toBe(setCallsBefore);

    delete global.confirm;
  });

  it("should highlight lightning icon for quick send template", async () => {
    setupChromeMock(makeStore({ quickSendTemplateId: "t1" }));
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      const lightning = document.querySelector(".btn-lightning");
      expect(lightning).toBeTruthy();
    });

    const lightning = document.querySelector(".btn-lightning");
    expect(lightning.classList.contains("active")).toBe(true);
  });

  it("should switch template when clicking another template name", async () => {
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

    // Click on the second template
    const items = document.querySelectorAll(".template-name");
    items[1].click();

    await vi.waitFor(() => {
      expect(document.getElementById("template-name").value).toBe("Hook B");
    });
    expect(document.getElementById("webhook-url").value).toBe("https://b.com");
    expect(document.getElementById("http-method").value).toBe("GET");
  });

  it("should handle editor quick send toggle", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("editor-form").style.display).toBe("block");
    });

    const editorToggle = document.getElementById("editor-quick-send");
    editorToggle.checked = true;
    editorToggle.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  it("should apply system theme by default", async () => {
    setupChromeMock(makeStore());
    await import("../src/options/options.js");

    await vi.waitFor(() => {
      expect(document.getElementById("theme-select").value).toBe("system");
    });
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
});
