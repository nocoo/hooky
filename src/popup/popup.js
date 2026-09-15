import { resolveTemplate } from "../template.js";
import { applyI18n, t } from "../i18n.js";
import { loadStore, setActiveTemplateId } from "../store.js";
import { applyTheme } from "../theme.js";
import { getPageContext } from "../pagecontext.js";
import { LAST_RESULT_KEY, readLastResult, resultMessage } from "../feedback.js";
import { previewRequest } from "../webhook.js";

const noConfigEl = document.getElementById("no-config");
const webhookPanel = document.getElementById("webhook-panel");
const templateSelect = document.getElementById("template-select");
const methodBadge = document.getElementById("method-badge");
const urlDisplay = document.getElementById("url-display");
const paramsPreview = document.getElementById("params-preview");
const sendBtn = document.getElementById("send-btn");
const settingsBtn = document.getElementById("settings-btn");
const goSettingsBtn = document.getElementById("go-settings");
const toastEl = document.getElementById("toast");
const pasteBtn = document.getElementById("paste-clipboard");

let currentTemplate = null;
let pageContext = null;
let currentTab = null;
let toastTimer;
let clipboardTarget = null;
let clipboardBusy = false;

function showToast(message, type = "success") {
  toastEl.textContent = message;
  toastEl.className = `toast ${type} visible`;
  clearTimeout(toastTimer);
  if (type === "success") toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 8000);
}

function renderLastResult(result) {
  if (!result?.id) return;
  document.getElementById("last-result").hidden = false;
  document.getElementById("last-result-name").textContent = result.name;
  document.getElementById("last-result-time").textContent = new Date(result.startedAt).toLocaleTimeString();
  const status = document.getElementById("last-result-status");
  status.textContent = resultMessage(result);
  status.className = result.state === "failed" || result.state === "unknown" ? "error" : "";
  document.getElementById("last-result-id").textContent = result.id;
  document.getElementById("last-response").hidden = !result.receipt;
  document.getElementById("response-note").textContent = result.receipt?.note ? t(result.receipt.note) : "";
  document.getElementById("response-body").textContent = result.receipt?.text || "";
  document.getElementById("last-result-http").hidden = !result.business;
  document.getElementById("last-result-http").textContent = result.business ? `HTTP ${result.status}` : "";
  document.getElementById("response-field-note").textContent = result.receipt?.fieldNote ? t(result.receipt.fieldNote) : "";
  const fields = document.getElementById("response-fields-summary");
  fields.replaceChildren();
  for (const key of ["receiptId", "message"]) {
    if (result.receipt?.[key] === undefined) continue;
    const label = document.createElement("dt");
    label.textContent = t(key === "receiptId" ? "receiptId" : "receiptMessage");
    const value = document.createElement("dd");
    value.textContent = result.receipt[key];
    fields.append(label, value);
  }
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

async function getPopupPageContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab || null;
  return getPageContext(tab);
}

function renderParams(params, context) {
  paramsPreview.innerHTML = "";

  if (!params || params.length === 0) return;

  for (const param of params) {
    if (!param.key) continue;

    const item = document.createElement("div");
    item.className = "param-item";

    const keyLabel = document.createElement("span");
    keyLabel.className = "param-key";
    keyLabel.textContent = param.key;

    const resolved = resolveTemplate(param.value, { ...context, send: { id: "{{send.id}}" } });
    const valueInput = document.createElement("textarea");
    valueInput.rows = 2;
    valueInput.value = resolved;
    valueInput.setAttribute("aria-label", param.key);
    valueInput.dataset.originalTemplate = param.value;
    valueInput.dataset.originalValue = resolved;

    item.appendChild(keyLabel);
    item.appendChild(valueInput);
    paramsPreview.appendChild(item);
  }
}

function showTemplate(tpl) {
  currentTemplate = tpl;
  clipboardTarget = null;
  pasteBtn.disabled = true;

  const method = tpl.method || "POST";
  methodBadge.textContent = method;
  methodBadge.className = `method-badge ${method.toLowerCase()}`;
  urlDisplay.textContent = tpl.url;
  urlDisplay.title = tpl.url;

  renderParams(tpl.params, pageContext);
  updateRequestPreview();
}

function getResolvedParams() {
  const items = paramsPreview.querySelectorAll(".param-item");
  const params = [];
  for (const item of items) {
    const key = item.querySelector(".param-key").textContent;
    const input = item.querySelector("textarea");
    if (input.dataset.literal !== "true" && input.value === input.dataset.originalValue) {
      params.push({ key, value: input.dataset.originalTemplate, resolve: true });
    } else params.push({ key, value: input.value });
  }
  return params;
}

async function pasteClipboard() {
  const target = clipboardTarget;
  if (!target?.isConnected || clipboardBusy) return;
  clipboardBusy = true;
  pasteBtn.disabled = true;
  try {
    if (!await chrome.permissions.request({ permissions: ["clipboardRead"] })) {
      showToast(t("clipboardDenied"), "error");
      return;
    }
    const text = await navigator.clipboard.readText();
    if (!target.isConnected || target !== clipboardTarget) return;
    target.value = text;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.focus();
    toastEl.classList.remove("visible");
  } catch {
    showToast(t("clipboardUnavailable"), "error");
  } finally {
    clipboardBusy = false;
    pasteBtn.disabled = !clipboardTarget?.isConnected;
  }
}

function updateRequestPreview() {
  try {
    document.getElementById("popup-request-preview").textContent = previewRequest(
      { ...currentTemplate, params: getResolvedParams() }, { ...pageContext, send: { id: "{{send.id}}" } }, true,
    );
  } catch (error) {
    document.getElementById("popup-request-preview").textContent = t(error.message);
  }
}

async function sendWebhook() {
  if (!currentTemplate || sendBtn.disabled) return;

  sendBtn.disabled = true;
  sendBtn.textContent = t("sending");

  try {
    const resolvedParams = getResolvedParams();
    const config = { ...currentTemplate, params: resolvedParams };

    const result = await chrome.runtime.sendMessage({
      type: "EXECUTE_WEBHOOK",
      resolved: true,
      config,
      context: pageContext,
      tab: currentTab,
    });

    renderLastResult(result);
    if (result?.ok) {
      showToast(resultMessage(result), "success");
    } else {
      const msg = result?.state ? resultMessage(result) : result?.error || t("failedStatus", [String(result?.status || "unknown")]);
      showToast(msg, "error");
    }
  } catch (err) {
    showToast(err.message || t("requestFailed"), "error");
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = t("send");
  }
}

async function init() {
  applyI18n();

  const store = await loadStore();
  renderLastResult(await readLastResult());

  // Apply theme
  applyTheme(store.theme || "system");

  if (!store.templates || store.templates.length === 0) {
    noConfigEl.style.display = "block";
    webhookPanel.style.display = "none";
    return;
  }

  noConfigEl.style.display = "none";
  webhookPanel.style.display = "block";

  // Build template dropdown
  templateSelect.innerHTML = "";
  for (const tpl of store.templates) {
    const option = document.createElement("option");
    option.value = tpl.id;
    option.textContent = tpl.name || t("defaultTemplateName");
    templateSelect.appendChild(option);
  }

  // Select active template
  const activeId = store.activeTemplateId || store.templates[0].id;
  templateSelect.value = activeId;

  // Get page context first
  pageContext = await getPopupPageContext();
  document.getElementById("page-title").textContent = pageContext.page.title || t("currentPage");
  document.getElementById("page-host").textContent = pageContext.page.url;

  // Show the active template
  const activeTpl = store.templates.find((t) => t.id === activeId) || store.templates[0];
  templateSelect.value = activeTpl.id;
  showTemplate(activeTpl);
}

templateSelect.addEventListener("change", async () => {
  const store = await loadStore();
  const tpl = store.templates.find((t) => t.id === templateSelect.value);
  if (tpl) {
    await setActiveTemplateId(tpl.id);
    showTemplate(tpl);
  }
});

settingsBtn.addEventListener("click", openSettings);
goSettingsBtn.addEventListener("click", openSettings);
sendBtn.addEventListener("click", sendWebhook);
pasteBtn.addEventListener("click", pasteClipboard);
paramsPreview.addEventListener("focusin", (event) => {
  if (event.target.tagName === "TEXTAREA") {
    clipboardTarget = event.target;
    pasteBtn.disabled = clipboardBusy;
  }
});
paramsPreview.addEventListener("input", (event) => {
  event.target.dataset.literal = "true";
  updateRequestPreview();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes[LAST_RESULT_KEY]?.newValue) renderLastResult(changes[LAST_RESULT_KEY].newValue);
});

init().catch((err) => showToast(err.message || t("requestFailed"), "error"));
