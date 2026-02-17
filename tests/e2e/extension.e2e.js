/**
 * E2E test for Hooky Chrome Extension (multi-template version).
 *
 * Launches Chromium with the extension loaded and verifies:
 * 1. Extension loads without errors
 * 2. Options page renders, creates a template, and saves configuration
 * 3. Popup page renders with template dropdown and sends webhook
 */

const puppeteer = require("puppeteer");
const path = require("path");
const http = require("http");

const EXTENSION_PATH = path.resolve(__dirname, "../..");
const TIMEOUT = 15000;

let server;
let webhookReceived = null;

/** Start a local HTTP server to receive webhook calls */
function startWebhookServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      // Handle CORS preflight
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        // Only capture requests to /hook (ignore favicon, etc.)
        if (req.url === "/hook") {
          webhookReceived = {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: body ? JSON.parse(body) : null,
          };
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      console.log(`  Webhook server listening on port ${port}`);
      resolve(port);
    });
  });
}

function stopWebhookServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

async function getExtensionId(browser) {
  const targets = browser.targets();
  const extensionTarget = targets.find(
    (t) => t.type() === "service_worker" && t.url().includes("chrome-extension://"),
  );
  if (extensionTarget) {
    const match = extensionTarget.url().match(/chrome-extension:\/\/([^/]+)/);
    return match ? match[1] : null;
  }
  return null;
}

async function waitForExtensionId(browser, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const id = await getExtensionId(browser);
    if (id) return id;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Could not find extension ID");
}

async function runTests() {
  const port = await startWebhookServer();
  let browser;
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  try {
    console.log("\nLaunching browser with extension...");
    browser = await puppeteer.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--no-first-run",
        "--disable-default-apps",
      ],
    });

    const extensionId = await waitForExtensionId(browser);
    console.log(`  Extension ID: ${extensionId}`);
    assert(!!extensionId, "Extension loaded successfully");

    // --- Test Options Page ---
    console.log("\nTesting Options page...");
    const optionsPage = await browser.newPage();
    await optionsPage.goto(
      `chrome-extension://${extensionId}/src/options/options.html`,
      { waitUntil: "domcontentloaded", timeout: TIMEOUT },
    );
    await new Promise((r) => setTimeout(r, 500)); // Wait for migration + render

    // Initially: empty state (no templates)
    const emptyVisible = await optionsPage.$eval(
      "#editor-empty",
      (el) => getComputedStyle(el).display !== "none",
    );
    assert(emptyVisible, "Options page: Empty state shown initially");

    // Template list should be empty
    const templateListEl = await optionsPage.$("#template-list");
    assert(!!templateListEl, "Options page: Template list exists");

    // Click "New" to create a template
    await optionsPage.click("#new-template");
    await new Promise((r) => setTimeout(r, 500)); // Wait for creation + re-render

    // Editor form should now be visible
    const formVisible = await optionsPage.$eval(
      "#editor-form",
      (el) => el.style.display !== "none",
    );
    assert(formVisible, "Options page: Editor form visible after creating template");

    // Template list should have one item
    const listItems = await optionsPage.$$("#template-list li");
    assert(listItems.length === 1, "Options page: Template list has one entry");

    // Verify elements exist in editor
    const urlInput = await optionsPage.$("#webhook-url");
    assert(!!urlInput, "Options page: URL input exists");

    const methodSelect = await optionsPage.$("#http-method");
    assert(!!methodSelect, "Options page: Method select exists");

    const addParamBtn = await optionsPage.$("#add-param");
    assert(!!addParamBtn, "Options page: Add param button exists");

    // Fill in template name
    const nameInput = await optionsPage.$("#template-name");
    await nameInput.click({ clickCount: 3 }); // Select all existing text
    await nameInput.type("E2E Test Hook");

    // Fill in URL
    await optionsPage.type("#webhook-url", `http://127.0.0.1:${port}/hook`);
    await optionsPage.select("#http-method", "POST");

    // Add a parameter
    await optionsPage.click("#add-param");
    await optionsPage.waitForSelector(".param-row");
    const paramRows = await optionsPage.$$(".param-row");
    assert(paramRows.length === 1, "Options page: Param row added");

    // Fill key-value
    await optionsPage.type(".param-row .param-key", "source");
    await optionsPage.type(".param-row .param-value", "hooky-e2e");

    // Save
    await optionsPage.click("#save");
    await new Promise((r) => setTimeout(r, 500)); // Wait for save

    // Status shows "Saved!" (the status element gets a visible class)
    const statusText = await optionsPage.$eval("#status", (el) => el.textContent);
    assert(statusText === "Saved!", "Options page: Config saved successfully");

    await optionsPage.close();

    // --- Test Popup Page ---
    console.log("\nTesting Popup page...");
    const popupPage = await browser.newPage();
    await popupPage.goto(
      `chrome-extension://${extensionId}/src/popup/popup.html`,
      { waitUntil: "domcontentloaded", timeout: TIMEOUT },
    );

    await new Promise((r) => setTimeout(r, 500)); // Wait for config load

    // Webhook panel should be visible (templates exist now)
    const panelDisplay = await popupPage.$eval(
      "#webhook-panel",
      (el) => el.style.display,
    );
    assert(panelDisplay === "block", "Popup: Webhook panel is visible");

    // Template dropdown should exist and have one option
    const selectOptions = await popupPage.$$eval(
      "#template-select option",
      (opts) => opts.map((o) => o.textContent),
    );
    assert(selectOptions.length === 1, "Popup: Template select has one option");
    assert(selectOptions[0] === "E2E Test Hook", "Popup: Template select shows correct name");

    // Method badge
    const methodText = await popupPage.$eval(
      "#method-badge",
      (el) => el.textContent,
    );
    assert(methodText === "POST", "Popup: Method badge shows POST");

    // URL display
    const urlText = await popupPage.$eval(
      "#url-display",
      (el) => el.textContent,
    );
    assert(
      urlText.includes(`127.0.0.1:${port}`),
      "Popup: URL display shows webhook URL",
    );

    // Click send
    await popupPage.click("#send-btn");
    await new Promise((r) => setTimeout(r, 1000)); // Wait for request

    // Verify webhook was received
    assert(webhookReceived !== null, "Webhook: Request received by server");
    assert(webhookReceived?.method === "POST", "Webhook: Method is POST");
    assert(
      webhookReceived?.body?.source === "hooky-e2e",
      "Webhook: Body contains correct param",
    );

    // Check toast notification
    const toastClasses = await popupPage.$eval(
      "#toast",
      (el) => el.className,
    );
    assert(
      toastClasses.includes("success"),
      "Popup: Success toast displayed",
    );

    await popupPage.close();

    // --- Test Rules UI in Options Page ---
    console.log("\nTesting Quick Send Rules...");
    const rulesPage = await browser.newPage();
    await rulesPage.goto(
      `chrome-extension://${extensionId}/src/options/options.html`,
      { waitUntil: "domcontentloaded", timeout: TIMEOUT },
    );
    await new Promise((r) => setTimeout(r, 500));

    // Verify accordion panels exist
    const panels = await rulesPage.$$(".accordion-panel");
    assert(panels.length === 3, "Rules: Three accordion panels exist");

    // Templates panel should be active by default
    const templatesActive = await rulesPage.$eval(
      "#panel-templates",
      (el) => el.classList.contains("active"),
    );
    assert(templatesActive, "Rules: Templates panel is active by default");

    // Click Rules accordion trigger to open rules panel
    await rulesPage.click('[data-panel="panel-rules"]');
    await new Promise((r) => setTimeout(r, 300));

    const rulesActive = await rulesPage.$eval(
      "#panel-rules",
      (el) => el.classList.contains("active"),
    );
    assert(rulesActive, "Rules: Rules panel is active after click");

    // Templates panel should now be inactive
    const templatesInactive = await rulesPage.$eval(
      "#panel-templates",
      (el) => !el.classList.contains("active"),
    );
    assert(templatesInactive, "Rules: Templates panel closed when Rules opened");

    // No rules message should be visible
    const noRulesVisible = await rulesPage.$eval(
      "#no-rules",
      (el) => !el.classList.contains("hidden"),
    );
    assert(noRulesVisible, "Rules: 'No rules' message shown initially");

    // Click + to add a new rule
    await rulesPage.click("#add-rule");
    await new Promise((r) => setTimeout(r, 500));

    // Rule editor form should be visible
    const ruleFormVisible = await rulesPage.$eval(
      "#rule-editor-form",
      (el) => el.style.display !== "none",
    );
    assert(ruleFormVisible, "Rules: Rule editor form is visible after adding rule");

    // Rules list should have one item
    const ruleItems = await rulesPage.$$("#rules-list li");
    assert(ruleItems.length === 1, "Rules: Rules list has one entry");

    // Fill in rule details
    await rulesPage.select("#rule-field", "url");
    await rulesPage.select("#rule-operator", "contains");
    await rulesPage.type("#rule-value", "github.com");

    // Template dropdown should have the template we created earlier
    const ruleTemplateOptions = await rulesPage.$$eval(
      "#rule-template option",
      (opts) => opts.map((o) => o.textContent),
    );
    assert(
      ruleTemplateOptions.includes("E2E Test Hook"),
      "Rules: Template dropdown contains 'E2E Test Hook'",
    );

    // Save the rule
    await rulesPage.click("#save");
    await new Promise((r) => setTimeout(r, 500));

    // Status should show saved
    const ruleStatusText = await rulesPage.$eval("#status", (el) => el.textContent);
    assert(ruleStatusText === "Saved!", "Rules: Rule saved successfully");

    // No-rules message should be hidden now
    const noRulesHidden = await rulesPage.$eval(
      "#no-rules",
      (el) => el.classList.contains("hidden"),
    );
    assert(noRulesHidden, "Rules: 'No rules' message hidden after adding rule");

    // Delete the rule (should not show confirmation dialog)
    await rulesPage.click("#delete-template");
    await new Promise((r) => setTimeout(r, 500));

    // Rules list should be empty
    const ruleItemsAfterDelete = await rulesPage.$$("#rules-list li");
    assert(ruleItemsAfterDelete.length === 0, "Rules: Rules list empty after delete");

    // No-rules message should be visible again
    const noRulesVisibleAgain = await rulesPage.$eval(
      "#no-rules",
      (el) => !el.classList.contains("hidden"),
    );
    assert(noRulesVisibleAgain, "Rules: 'No rules' message shown after delete");

    // Switch back to templates panel
    await rulesPage.click('[data-panel="panel-templates"]');
    await new Promise((r) => setTimeout(r, 300));

    const templatesActiveAgain = await rulesPage.$eval(
      "#panel-templates",
      (el) => el.classList.contains("active"),
    );
    assert(templatesActiveAgain, "Rules: Can switch back to Templates panel");

    await rulesPage.close();
  } catch (err) {
    console.error(`\n  ERROR: ${err.message}`);
    failed++;
  } finally {
    if (browser) await browser.close();
    await stopWebhookServer();

    console.log(`\n  Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
