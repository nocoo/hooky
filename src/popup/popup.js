import { resolveTemplate } from "../template.js";
import { applyI18n, t } from "../i18n.js";
import { loadStore, setActiveTemplateId } from "../store.js";
import { applyTheme } from "../theme.js";
import { getPageContext } from "../pagecontext.js";
import { LAST_RESULT_KEY, readLastResult, resultMessage } from "../feedback.js";

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

let currentTemplate = null;
let pageContext = null;
let currentTab = null;
let toastTimer;

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

    const resolved = resolveTemplate(param.value, context);
    const valueInput = document.createElement(resolved.includes("\n") ? "textarea" : "input");
    valueInput.value = resolved;
    valueInput.setAttribute("aria-label", param.key);
    valueInput.dataset.originalTemplate = param.value;

    item.appendChild(keyLabel);
    item.appendChild(valueInput);
    paramsPreview.appendChild(item);
  }
}

function showTemplate(tpl) {
  currentTemplate = tpl;

  const method = tpl.method || "POST";
  methodBadge.textContent = method;
  methodBadge.className = `method-badge ${method.toLowerCase()}`;
  urlDisplay.textContent = tpl.url;
  urlDisplay.title = tpl.url;

  renderParams(tpl.params, pageContext);
}

function getResolvedParams() {
  const items = paramsPreview.querySelectorAll(".param-item");
  const params = [];
  for (const item of items) {
    const key = item.querySelector(".param-key").textContent;
    const value = item.querySelector("input, textarea").value;
    params.push({ key, value });
  }
  return params;
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
      context: { page: {} },
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes[LAST_RESULT_KEY]?.newValue) renderLastResult(changes[LAST_RESULT_KEY].newValue);
});

init().catch((err) => showToast(err.message || t("requestFailed"), "error"));
