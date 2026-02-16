/**
 * E2E test for Hooky Chrome Extension.
 *
 * Launches Chromium with the extension loaded and verifies:
 * 1. Extension loads without errors
 * 2. Options page renders and saves configuration
 * 3. Popup page renders and shows configured webhook
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
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        webhookReceived = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
        };
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
  // In Manifest V3, service workers appear as targets
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
      headless: false, // Extensions require non-headless mode
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

    // Verify elements exist
    const urlInput = await optionsPage.$("#webhook-url");
    assert(!!urlInput, "Options page: URL input exists");

    const methodSelect = await optionsPage.$("#http-method");
    assert(!!methodSelect, "Options page: Method select exists");

    const addParamBtn = await optionsPage.$("#add-param");
    assert(!!addParamBtn, "Options page: Add param button exists");

    // Fill in configuration
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

    // Check if webhook panel is visible
    const panelDisplay = await popupPage.$eval(
      "#webhook-panel",
      (el) => el.style.display,
    );
    assert(panelDisplay === "block", "Popup: Webhook panel is visible");

    const methodText = await popupPage.$eval(
      "#method-badge",
      (el) => el.textContent,
    );
    assert(methodText === "POST", "Popup: Method badge shows POST");

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
