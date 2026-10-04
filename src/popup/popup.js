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
const sendLabel = document.getElementById("send-label");
const settingsBtn = document.getElementById("settings-btn");
const goSettingsBtn = document.getElementById("go-settings");
const toastEl = document.getElementById("toast");
const sendAnywayBtn = document.getElementById("send-anyway");
const container = document.querySelector(".container");
const validationError = document.getElementById("validation-error");
const editTemplateBtn = document.getElementById("edit-template");
const showResult = new URLSearchParams(location.search).get("view") === "last";

let currentTemplate = null;
let pageContext = null;
let currentTab = null;
let toastTimer;
let duplicateToken = null;
let lastRenderedAt = 0;
let sending = false;
let duplicateOpen = false;

function renderActions() {
  const view = container.dataset.view;
  const repeat = duplicateOpen && view !== "loading" && view !== "error";
  const ready = view === "ready" && !!currentTemplate;
  sendBtn.hidden = !sending && (!ready || repeat || !validationError.hidden);
  sendBtn.disabled = sending;
  sendBtn.setAttribute("aria-busy", String(sending));
  sendLabel.textContent = t(sending ? "sending" : "send");
  goSettingsBtn.hidden = view !== "empty" || repeat || sending;
  document.getElementById("retry-load").hidden = view !== "error";
  editTemplateBtn.hidden = !ready || repeat || sending || validationError.hidden;
  sendAnywayBtn.hidden = !repeat || sending;
  document.getElementById("back-to-capture").hidden = !repeat || sending;
  document.getElementById("pending-help").hidden = !sending;
  document.getElementById("duplicate-actions").hidden = !repeat || sending;
  noConfigEl.style.display = view === "empty" && !repeat ? "block" : "none";
  webhookPanel.style.display = view === "ready" && !repeat ? "block" : "none";
  settingsBtn.hidden = view !== "ready";
}

function showView(view) {
  container.dataset.view = view;
  document.getElementById("loading").hidden = view !== "loading";
  document.getElementById("startup-error").hidden = view !== "error";
  renderActions();
}

function showLoadError() {
  currentTemplate = null;
  sendBtn.hidden = true;
  showView("error");
}

function setSending(value) {
  sending = value;
  container.dataset.sending = String(sending);
  templateSelect.disabled = sending;
  for (const field of paramsPreview.querySelectorAll("textarea")) field.disabled = sending;
  if (sending) {
    clearTimeout(toastTimer);
    toastEl.classList.remove("visible");
    document.getElementById("last-result").hidden = true;
    document.getElementById("result-details").open = false;
  }
  renderActions();
}

function showToast(message, type = "success") {
  document.getElementById("toast-message").textContent = message;
  toastEl.className = `toast ${type} visible`;
  toastEl.setAttribute("role", type === "error" ? "alert" : "status");
  toastEl.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  clearTimeout(toastTimer);
  if (type === "success") toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 8000);
}

function renderLastResult(result) {
  if (!result?.id) return;
  const observedAt = result.lastActionAt || result.startedAt;
  if (observedAt < lastRenderedAt) return;
  lastRenderedAt = observedAt;
  const resultEl = document.getElementById("last-result");
  resultEl.hidden = false;
  resultEl.dataset.state = result.state;
  document.getElementById("last-result-name").textContent = result.name;
  document.getElementById("last-result-time").textContent = new Date(result.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const status = document.getElementById("last-result-status");
  status.textContent = resultMessage(result);
  const warning = result.state === "unknown" || !!result.duplicateToken || (result.state === "success" && result.status === 202);
  status.className = result.state === "failed" && !warning ? "error" : "";
  resultEl.dataset.tone = warning ? "warning" : result.state;
  const help = document.getElementById("result-help");
  const authorizationFailed = result.state === "failed" && [401, 403].includes(result.status);
  help.hidden = result.state !== "failed" || !!result.error || !!result.duplicateToken;
  help.textContent = t(authorizationFailed ? "popupCheckAuthorization" : "popupCheckReceiver");
  document.getElementById("result-settings").hidden = !authorizationFailed;
  document.getElementById("last-result-id").textContent = result.id;
  document.getElementById("last-response").hidden = !result.receipt;
  document.getElementById("response-note").textContent = result.receipt?.note ? t(result.receipt.note) : "";
  document.getElementById("response-body").textContent = result.receipt?.text || "";
  document.getElementById("last-result-http").hidden = !result.status;
  document.getElementById("last-result-http").textContent = result.status ? `HTTP ${result.status}` : "";
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
  const token = result.duplicateToken || null;
  if (duplicateToken === token) { renderActions(); return; }
  duplicateToken = token;
  duplicateOpen = !!token;
  renderActions();
  sendAnywayBtn.disabled = true;
  document.getElementById("duplicate-preview").textContent = "";
  if (!token) return;
  chrome.runtime.sendMessage({ type: "GET_DUPLICATE_CAPTURE", token }).catch(() => null).then((capture) => {
    if (duplicateToken !== token) return;
    document.getElementById("duplicate-preview").textContent = capture?.preview || t("captureExpired");
    sendAnywayBtn.disabled = !capture?.preview;
  });
}

function showSendResult(result) {
  renderLastResult(result);
  if (result?.id) {
    clearTimeout(toastTimer);
    toastEl.classList.remove("visible");
    return;
  }
  if (result?.ok) showToast(resultMessage(result), "success");
  else {
    const msg = result?.state ? resultMessage(result) : result?.error || t("failedStatus", [String(result?.status || "unknown")]);
    showToast(msg, "error");
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

  for (const param of params || []) {
    if (!param.key) continue;

    const item = document.createElement("div");
    item.className = "param-item";

    const keyLabel = document.createElement("span");
    keyLabel.className = "param-key";
    keyLabel.textContent = param.key;

    const resolved = resolveTemplate(param.value, { ...context, send: { id: "{{send.id}}" } });
    const valueInput = document.createElement("textarea");
    valueInput.rows = 1;
    valueInput.value = resolved;
    valueInput.setAttribute("aria-label", param.key);
    valueInput.dataset.originalTemplate = param.value;
    valueInput.dataset.originalValue = resolved;

    item.appendChild(keyLabel);
    item.appendChild(valueInput);
    paramsPreview.appendChild(item);
  }
  document.getElementById("params-section").hidden = !paramsPreview.childElementCount;
}

function showTemplate(tpl) {
  currentTemplate = { ...tpl, method: tpl.method || "POST" };

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

function updateRequestPreview() {
  validationError.hidden = true;
  try {
    document.getElementById("popup-request-preview").textContent = previewRequest(
      { ...currentTemplate, params: getResolvedParams() }, { ...pageContext, send: { id: "{{send.id}}" } }, true,
    );
  } catch (error) {
    document.getElementById("popup-request-preview").textContent = t(error.message);
    document.getElementById("validation-message").textContent = t(error.message);
    validationError.hidden = false;
  }
  renderActions();
}

async function sendWebhook() {
  if (!currentTemplate || sending || duplicateOpen || !validationError.hidden) return;

  setSending(true);

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

    showSendResult(result);
  } catch {
    showToast(t("requestUnconfirmed"), "error");
  } finally {
    setSending(false);
  }
}

async function init() {
  showView("loading");
  applyI18n();
  document.getElementById("version").textContent = "v" + chrome.runtime.getManifest().version;

  const store = await loadStore();
  applyTheme(store.theme || "system");
  if (showResult) renderLastResult(await readLastResult());

  if (!store.templates || store.templates.length === 0) {
    showView("empty");
    return;
  }

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
  showView("ready");
  showTemplate(activeTpl);
}

templateSelect.addEventListener("change", async () => {
  try {
    const store = await loadStore();
    const tpl = store.templates.find((t) => t.id === templateSelect.value);
    if (tpl) {
      await setActiveTemplateId(tpl.id);
      showTemplate(tpl);
    }
  } catch { showLoadError(); }
});

settingsBtn.addEventListener("click", openSettings);
goSettingsBtn.addEventListener("click", openSettings);
editTemplateBtn.addEventListener("click", openSettings);
document.getElementById("result-settings").addEventListener("click", openSettings);
document.getElementById("retry-load").addEventListener("click", () => init().catch(showLoadError));
document.getElementById("back-to-capture").addEventListener("click", () => {
  duplicateOpen = false;
  renderActions();
});
sendBtn.addEventListener("click", sendWebhook);
sendAnywayBtn.addEventListener("click", async () => {
  if (!duplicateToken || sendAnywayBtn.disabled || sending) return;
  sendAnywayBtn.disabled = true;
  setSending(true);
  try { showSendResult(await chrome.runtime.sendMessage({ type: "SEND_ANYWAY", token: duplicateToken })); }
  catch { showToast(t("requestUnconfirmed"), "error"); }
  finally { setSending(false); }
});
paramsPreview.addEventListener("input", (event) => {
  event.target.dataset.literal = "true";
  updateRequestPreview();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (showResult && area === "session" && changes[LAST_RESULT_KEY]?.newValue) renderLastResult(changes[LAST_RESULT_KEY].newValue);
});

init().catch(showLoadError);
