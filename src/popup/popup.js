import { resolveTemplate } from "../template.js";
import { applyI18n, t } from "../i18n.js";

const noConfigEl = document.getElementById("no-config");
const webhookPanel = document.getElementById("webhook-panel");
const methodBadge = document.getElementById("method-badge");
const urlDisplay = document.getElementById("url-display");
const paramsPreview = document.getElementById("params-preview");
const sendBtn = document.getElementById("send-btn");
const settingsBtn = document.getElementById("settings-btn");
const goSettingsBtn = document.getElementById("go-settings");
const toastEl = document.getElementById("toast");

let currentConfig = null;
let pageContext = null;

function showToast(message, type = "success") {
  toastEl.textContent = message;
  toastEl.className = `toast ${type} visible`;
  setTimeout(() => toastEl.classList.remove("visible"), 2500);
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

async function getPageContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { page: { url: "", title: "", selection: "", meta: {} } };

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PAGE_CONTEXT",
    });
    return response || { page: { url: tab.url || "", title: tab.title || "", selection: "", meta: {} } };
  } catch {
    // Content script not loaded (e.g. chrome:// pages) — fallback to tab info
    return {
      page: {
        url: tab.url || "",
        title: tab.title || "",
        selection: "",
        meta: {},
      },
    };
  }
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

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.value = resolveTemplate(param.value, context);
    valueInput.dataset.originalTemplate = param.value;

    item.appendChild(keyLabel);
    item.appendChild(valueInput);
    paramsPreview.appendChild(item);
  }
}

function getResolvedParams() {
  const items = paramsPreview.querySelectorAll(".param-item");
  const params = [];
  for (const item of items) {
    const key = item.querySelector(".param-key").textContent;
    const value = item.querySelector("input").value;
    // Use the user-edited value directly (already resolved)
    params.push({ key, value });
  }
  return params;
}

async function sendWebhook() {
  if (!currentConfig) return;

  sendBtn.disabled = true;
  sendBtn.textContent = t("sending");

  try {
    // Use the (possibly edited) resolved params directly
    const resolvedParams = getResolvedParams();
    const config = { ...currentConfig, params: resolvedParams };

    const result = await chrome.runtime.sendMessage({
      type: "EXECUTE_WEBHOOK",
      config,
      context: { page: {} }, // Context already resolved in param values
    });

    if (result?.ok) {
      showToast(t("successStatus", [String(result.status)]), "success");
    } else {
      const msg = result?.error || t("failedStatus", [String(result?.status || "unknown")]);
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

  const data = await chrome.storage.local.get("webhook");
  currentConfig = data.webhook;

  if (!currentConfig || !currentConfig.url) {
    noConfigEl.style.display = "block";
    webhookPanel.style.display = "none";
    return;
  }

  noConfigEl.style.display = "none";
  webhookPanel.style.display = "block";

  // Show method + URL
  const method = currentConfig.method || "POST";
  methodBadge.textContent = method;
  methodBadge.className = `method-badge ${method.toLowerCase()}`;
  urlDisplay.textContent = currentConfig.url;
  urlDisplay.title = currentConfig.url;

  // Resolve page context and render params
  pageContext = await getPageContext();
  renderParams(currentConfig.params, pageContext);
}

settingsBtn.addEventListener("click", openSettings);
goSettingsBtn.addEventListener("click", openSettings);
sendBtn.addEventListener("click", sendWebhook);

init();
