const fs = require("node:fs/promises");
const path = require("node:path");

/** Real Chrome boundary checks: extension messaging, service worker fetch, storage and page injection. */
async function runCaptureScenarios({ browser, extensionId, port, requests, assert }) {
  const extension = `chrome-extension://${extensionId}/`;
  const origin = `http://127.0.0.1:${port}`;
  const options = await browser.newPage();
  await options.goto(extension + "src/options/options.html");
  await options.waitForSelector("#params-list .param-value");
  const permissions = await options.evaluate(async () => ({
    notifications: await chrome.permissions.contains({ permissions: ["notifications"] }),
    clipboard: await chrome.permissions.contains({ permissions: ["clipboardRead"] }),
  }));
  assert(!permissions.notifications && !permissions.clipboard, "Optional permissions are absent on a fresh install");
  await options.$eval("#webhook-url", (input, url) => { input.value = url; input.dispatchEvent(new Event("input", { bubbles: true })); }, origin + "/capture");
  for (const [key, value] of [["notes", "{{page.selection}}"], ["request_id", "{{send.id}}"]]) {
    await options.click("#add-param");
    await options.type("#params-list .param-row:last-child .param-key", key);
    await options.type("#params-list .param-row:last-child .param-value", value);
  }
  await options.click("#template-advanced > summary");
  for (const [key, value] of [["Authorization", "Bearer e2e-secret"], ["Idempotency-Key", "{{send.id}}"]]) {
    await options.click("#add-header");
    await options.type("#headers-list .param-row:last-child .header-key", key);
    await options.type("#headers-list .param-row:last-child .header-value", value);
  }
  await options.$eval("#read-response", (el) => el.scrollIntoView({ block: "center" }));
  await options.click("#read-response");
  await options.waitForFunction(() => document.getElementById("read-response").checked && !document.getElementById("response-fields").disabled);
  await options.type("#response-message-path", "data.message");
  await options.type("#response-id-path", "data.id");
  await options.type("#response-success-path", "saved");
  await options.$eval("#duplicate-protection", (el) => el.scrollIntoView({ block: "center" }));
  await options.click("#duplicate-protection");
  await options.click("#save");
  await options.waitForFunction(() => document.getElementById("status").textContent === "Saved!" && !document.getElementById("save").disabled);
  const template = await options.evaluate(async () => (await chrome.storage.local.get("hooky")).hooky.templates[0]);
  assert(template.headers.length === 2 && template.response.enabled && template.duplicateWindow === 10, "Options save per-template headers, receipt rules and the duplicate window");
  const settingsPreview = await options.$eval("#request-preview", (el) => el.textContent);
  assert(settingsPreview.includes("authorization: ••••") && !settingsPreview.includes("e2e-secret"), "Native settings preview masks authentication");
  await fs.mkdir(path.resolve("dist/verification"), { recursive: true });
  await options.screenshot({ path: path.resolve("dist/verification/options-capture.png"), fullPage: true });
  await options.close();

  const article = await browser.newPage();
  await article.goto(origin + "/article");
  const workerTarget = await browser.waitForTarget((target) => target.type() === "service_worker" && target.url().startsWith(extension));
  const worker = await workerTarget.worker();
  const tab = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0], origin + "/article");

  const popup = await browser.newPage();
  await popup.goto(extension + "src/popup/popup.html");
  await popup.waitForSelector(".param-item textarea");
  const manual = "  pasted {{page.title}}\nline two  ";
  await popup.$$eval(".param-item textarea", (fields, text) => { fields[1].value = text; fields[1].dispatchEvent(new Event("input", { bubbles: true })); }, manual);
  const preview = await popup.$eval("#popup-request-preview", (el) => el.textContent);
  assert(preview.includes("authorization: ••••") && !preview.includes("e2e-secret"), "Native send preview masks headers while retaining edited text");
  await popup.click("#send-btn");
  await popup.waitForFunction(() => !document.getElementById("send-btn").disabled && document.getElementById("last-result-id").textContent);
  let result = await popup.evaluate(async () => (await chrome.storage.session.get("hookyLastResult")).hookyLastResult);
  const firstId = result.id;
  let received = requests.at(-1);
  assert(received.headers.authorization === "Bearer e2e-secret", "Chrome sends the configured Authorization header");
  assert(received.body.request_id === result.id && received.headers["idempotency-key"] === result.id, "Chrome shares one UUID between body, header and result");
  assert(received.body.notes === manual, "Native popup send preserves manual whitespace, newlines and literal variables");
  assert(result.status === 201 && result.business === "matched" && result.ok, "HTTP evidence and configured business success are both retained");
  assert(await popup.$eval("#response-fields-summary", (el) => el.textContent.includes("server-only receipt") && !el.querySelector("b")), "Native receipt rendering treats HTML as text");
  const count = requests.length;
  await popup.click("#send-btn");
  await popup.waitForFunction(() => !document.getElementById("duplicate-actions").hidden && !document.getElementById("send-anyway").disabled);
  assert(requests.length === count, "A completed duplicate is stopped before making a second request");
  await popup.screenshot({ path: path.resolve("dist/verification/duplicate-result.png"), fullPage: true });
  await popup.click("#send-anyway");
  await popup.waitForFunction(() => document.getElementById("duplicate-actions").hidden && !document.getElementById("last-result-status").textContent.includes("Sending"));
  result = await popup.evaluate(async () => (await chrome.storage.session.get("hookyLastResult")).hookyLastResult);
  assert(requests.length === count + 1 && result.id !== firstId, "Explicit Send anyway creates one new logical send");
  assert(requests.at(-1).body.notes === manual, "Explicit repeat uses the original capture");
  assert(await popup.evaluate(async () => (await chrome.storage.local.get("hooky")).hooky.templates[0].params[1].value === "{{page.selection}}"), "Manual capture does not rewrite the saved template");
  await popup.close();

  const selection = "context snapshot {{send.id}}\nnext line";
  await worker.evaluate(async ({ tab, templateId, selection }) => {
    await globalThis.hookyE2E.handleContextMenuClick({ menuItemId: "hooky-" + templateId, selectionText: selection }, tab);
  }, { tab, templateId: template.id, selection });
  received = requests.at(-1);
  assert(received.body.notes === selection, "Context-menu sends preserve the event selection snapshot and literal send.id text");
  const pageFeedback = await article.evaluate(() => document.getElementById("__hooky_send_feedback")?.shadowRoot.textContent);
  assert(pageFeedback?.includes("business success rule") && !pageFeedback.includes(selection) && !pageFeedback.includes("server-only receipt") && !pageFeedback.includes("e2e-secret"), "Real page feedback is visible and carries no capture, credential or receipt contents");
  assert(await worker.evaluate(async (tabId) => await chrome.action.getBadgeText({ tabId }) === "✓", tab.id), "Chrome retains the tab's success badge");

  await worker.evaluate(async ({ templateId }) => {
    const { hooky } = await chrome.storage.local.get("hooky");
    hooky.quickSendRules = [{ id: "capture-rule", field: "url", operator: "contains", value: "127.0.0.1", templateId, enabled: true }];
    await chrome.storage.local.set({ hooky });
  }, { templateId: template.id });
  await article.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("selection"));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await worker.evaluate(async (tab) => {
    await globalThis.hookyE2E.handleQuickSend(tab);
  }, tab);
  assert(requests.at(-1).body.notes === "quick capture {{page.title}}", "Quick Send extracts the real selection without recursively resolving it");
  const quickCount = requests.length;
  await worker.evaluate(async (tab) => {
    await globalThis.hookyE2E.handleQuickSend(tab);
  }, tab);
  assert(requests.length === quickCount, "Quick Send uses the same completed duplicate guard");
  await article.evaluate(() => getSelection().removeAllRanges());

  const panel = await browser.newPage();
  await panel.goto(extension + "src/popup/popup.html");
  await panel.waitForFunction(() => !document.getElementById("send-anyway").disabled);
  assert(requests.length === quickCount, "Opening the result panel never evaluates the matching Quick Send rule");
  await panel.click("#send-anyway");
  await panel.waitForFunction(() => document.getElementById("duplicate-actions").hidden && !document.getElementById("last-result-status").textContent.includes("Sending"));
  assert(requests.length === quickCount + 1 && requests.at(-1).body.notes === "quick capture {{page.title}}", "A context result can repeat its held capture even after page selection is cleared");

  const sendCase = (route, response, method = "POST") => panel.evaluate(async ({ template, origin, tab, route, response, method }) => chrome.runtime.sendMessage({
    type: "EXECUTE_WEBHOOK", tab, context: { page: { selection: route } },
    config: { ...template, url: origin + route, duplicateWindow: 0, response, method },
  }), { template, origin, tab, route, response, method });
  result = await sendCase("/business-failure", template.response);
  assert(result.status === 200 && result.httpOk && !result.ok && result.error === "businessRejected", "A 200 response can fail an explicitly configured business rule");
  result = await sendCase("/accepted", { enabled: true });
  assert(result.status === 202 && result.state === "success", "HTTP 202 remains acceptance without claiming durable storage");
  result = await sendCase("/empty", { enabled: true });
  assert(result.status === 204 && result.ok && result.receipt.note === "responseEmpty", "A native empty 204 response succeeds without a receipt body");
  result = await sendCase("/large", { enabled: true });
  assert(result.ok && result.receipt.note === "responseTruncated" && Buffer.byteLength(result.receipt.text) === 8192, "Native streaming truncates retained receipt bytes at 8 KiB");
  const started = Date.now();
  result = await sendCase("/slow", { enabled: true });
  assert(result.ok && result.receipt.note === "responseUnavailable" && Date.now() - started < 5500, "Native slow-body reading stops near three seconds and preserves HTTP success");
  result = await sendCase("/redirect", { enabled: false });
  assert(result.state === "unknown" && !requests.some((request) => request.url === "/redirect-target"), "Custom credentials never reach a redirect destination");

  for (const method of ["GET", "DELETE"]) {
    result = await sendCase("/capture#view?ignored", { enabled: false }, method);
    const sentUrl = new URL(requests.at(-1).url, origin);
    assert(sentUrl.searchParams.get("request_id") === result.id && sentUrl.searchParams.get("notes") === "/capture#view?ignored" && !sentUrl.hash, `${method} sends UUID and literal query values ahead of URL fragments`);
  }

  const beforeAttack = requests.length;
  const rejected = await worker.evaluate(async ({ tabId, config }) => {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: async (config) => chrome.runtime.sendMessage({ type: "EXECUTE_WEBHOOK", config, context: {} }), args: [config] });
    return result.result;
  }, { tabId: tab.id, config: template });
  assert(rejected.error === "requestFailed" && requests.length === beforeAttack, "An injected page context cannot call the privileged send message");
  await panel.close();
  await article.close();
}

module.exports = { runCaptureScenarios };
