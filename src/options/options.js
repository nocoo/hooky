import { applyI18n, t } from "../i18n.js";
import {
  loadStore,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setTheme,
  setNotificationMode,
  migrateFromLegacy,
  addQuickSendRule,
  updateQuickSendRule,
  deleteQuickSendRule,
  reorderQuickSendRules,
} from "../store.js";
import { applyTheme } from "../theme.js";
import { matchRule } from "../rules.js";
import { buildHeaders, previewRequest } from "../webhook.js";
import { validateResponseConfig } from "../response.js";

// ─── DOM refs ───

const templateListEl = document.getElementById("template-list");
const themeSelect = document.getElementById("theme-select");
const notificationSelect = document.getElementById("notification-mode");

const editorTitle = document.getElementById("editor-title");
const editorEmpty = document.getElementById("editor-empty");
const editorForm = document.getElementById("editor-form");
const ruleEditorForm = document.getElementById("rule-editor-form");
const rulesManager = document.getElementById("rules-manager");
const settingsFormEl = document.getElementById("settings-form");
const editorActions = document.getElementById("editor-actions");
const nameInput = document.getElementById("template-name");
const urlInput = document.getElementById("webhook-url");
const methodSelect = document.getElementById("http-method");
const paramsList = document.getElementById("params-list");
const addParamBtn = document.getElementById("add-param");
const headersList = document.getElementById("headers-list");
const showHeaderValues = document.getElementById("show-header-values");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");
const deleteBtn = document.getElementById("delete-template");

// Sidebar lists
const rulesListEl = document.getElementById("rules-list");
const settingsListEl = document.getElementById("settings-list");
const noRulesEl = document.getElementById("no-rules");

// Rule editor fields
const ruleFieldSelect = document.getElementById("rule-field");
const ruleOperatorSelect = document.getElementById("rule-operator");
const ruleValueInput = document.getElementById("rule-value");
const ruleTemplateSelect = document.getElementById("rule-template");
const ruleEnabledToggle = document.getElementById("rule-enabled");

let currentTemplateId = null;
let currentRuleId = null;
let currentSettingsItem = null;
let editorMode = null; // "template" | "rule" | "rules-list" | "settings" | null
let lastValueInput = null;
let statusTimer;
let notificationMode = "off";
let notificationCheck = 0;

// ─── Sidebar navigation ───

function initSidebar() {
  const navBtns = document.querySelectorAll(".sidebar-nav-btn");
  for (const btn of navBtns) {
    btn.addEventListener("click", () => {
      const panelId = btn.dataset.panel;
      const panel = document.getElementById(panelId);
      if (!panel) return;

      if (panel.classList.contains("active")) return; // already active, no-op

      // Deactivate all panels
      const panels = document.querySelectorAll(".sidebar-panel");
      for (const p of panels) {
        p.classList.remove("active");
      }

      // Activate clicked panel
      panel.classList.add("active");

      // Navigate to the correct right-pane view
      if (panelId === "panel-webhooks") {
        navigateToWebhooks();
      } else if (panelId === "panel-rules") {
        navigateToRules();
      } else if (panelId === "panel-settings") {
        navigateToSettings();
      }
    });
  }

  // Settings list items (static in HTML)
  for (const li of settingsListEl.children) {
    li.addEventListener("click", () => {
      selectSettingsItem(li.dataset.settings);
    });
  }
}

async function navigateToWebhooks() {
  const store = await loadStore();
  if (currentTemplateId && store.templates.find((t) => t.id === currentTemplateId)) {
    await selectTemplate(currentTemplateId);
  } else if (store.templates.length > 0) {
    await selectTemplate(store.templates[0].id);
  } else {
    showEditorEmpty();
  }
}

async function navigateToRules() {
  const store = await loadStore();
  renderRulesList(store.quickSendRules);
  showRulesManager(store);
}

async function navigateToSettings() {
  const store = await loadStore();
  currentSettingsItem = currentSettingsItem || "theme";
  selectSettingsItem(currentSettingsItem);
  showSettings(store);
}

// ─── Param row helpers ───

function createParamRow(key = "", value = "", kind = "param") {
  const row = document.createElement("div");
  row.className = "param-row";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.placeholder = t("paramKeyPlaceholder");
  keyInput.value = key;
  keyInput.className = `${kind}-key`;
  keyInput.setAttribute("aria-label", t("paramKeyPlaceholder"));

  const valueInput = document.createElement(kind === "header" ? "input" : "textarea");
  if (kind === "header") {
    valueInput.type = showHeaderValues.checked ? "text" : "password";
    valueInput.autocomplete = "off";
  } else valueInput.rows = 2;
  valueInput.placeholder = t("paramValuePlaceholder");
  valueInput.value = value;
  valueInput.className = `${kind}-value`;
  valueInput.setAttribute("aria-label", t("paramValuePlaceholder"));
  valueInput.addEventListener("focus", () => { lastValueInput = valueInput; });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-remove";
  removeBtn.textContent = "\u00d7";
  removeBtn.setAttribute("aria-label", t("removeParam"));
  removeBtn.addEventListener("click", () => {
    row.remove();
    updatePreview();
  });

  row.appendChild(keyInput);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);

  return row;
}

function getParams(list = paramsList, kind = "param") {
  const rows = list.querySelectorAll(".param-row");
  const params = [];
  for (const row of rows) {
    const key = row.querySelector(`.${kind}-key`).value.trim();
    const value = row.querySelector(`.${kind}-value`).value;
    params.push({ key, value });
  }
  return params;
}

// ─── Status flash ───

function showStatus(message, error = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", error);
  if (error && editorActions.style.display === "none") {
    editorEmpty.textContent = message;
    editorEmpty.style.display = "flex";
    editorEmpty.setAttribute("role", "alert");
  }
  statusEl.classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove("visible"), 3000);
}

function getResponseConfig() {
  const response = { enabled: document.getElementById("read-response").checked };
  for (const [key, id] of [["messagePath", "response-message-path"], ["receiptPath", "response-id-path"], ["successPath", "response-success-path"]]) {
    const value = document.getElementById(id).value.trim();
    if (value) response[key] = value;
  }
  if (response.successPath) response.successValue = document.getElementById("response-success-value").value;
  return response;
}

function updatePreview() {
  const params = getParams();
  const context = { page: { url: "{{page.url}}", title: "{{page.title}}", selection: "{{page.selection}}", meta: {
    description: "{{page.meta.description}}", "og:title": "{{page.meta.og:title}}", "og:description": "{{page.meta.og:description}}", "og:image": "{{page.meta.og:image}}",
  } }, send: { id: "{{send.id}}" } };
  const method = methodSelect.value;
  const url = urlInput.value || "https://example.com/webhook";
  try {
    document.getElementById("request-preview").textContent = previewRequest({ method, url, params, headers: getParams(headersList, "header"), response: getResponseConfig() }, context);
  } catch (error) {
    document.getElementById("request-preview").textContent = t(error.message);
  }
}

function makeKeyboardItem(li) {
  li.setAttribute("role", "button");
  li.tabIndex = 0;
}

// ─── Editor state ───

function showEditorEmpty() {
  editorMode = null;
  currentTemplateId = null;
  currentRuleId = null;
  currentSettingsItem = null;
  editorEmpty.style.display = "flex";
  editorForm.style.display = "none";
  ruleEditorForm.style.display = "none";
  rulesManager.style.display = "none";
  settingsFormEl.style.display = "none";
  editorActions.style.display = "none";
  editorTitle.textContent = t("webhookDetail");
}

function showTemplateEditor() {
  editorMode = "template";
  currentRuleId = null;
  currentSettingsItem = null;
  editorEmpty.style.display = "none";
  editorForm.style.display = "block";
  ruleEditorForm.style.display = "none";
  rulesManager.style.display = "none";
  settingsFormEl.style.display = "none";
  editorActions.style.display = "flex";
  editorTitle.textContent = t("webhookDetail");
}

function showRuleEditor() {
  editorMode = "rule";
  currentTemplateId = null;
  currentSettingsItem = null;
  editorEmpty.style.display = "none";
  editorForm.style.display = "none";
  ruleEditorForm.style.display = "block";
  rulesManager.style.display = "none";
  settingsFormEl.style.display = "none";
  editorActions.style.display = "flex";
  editorTitle.textContent = t("ruleDetail");
}

function showRulesManager(store) {
  editorMode = "rules-list";
  currentTemplateId = null;
  currentRuleId = null;
  currentSettingsItem = null;
  editorEmpty.style.display = "none";
  editorForm.style.display = "none";
  ruleEditorForm.style.display = "none";
  rulesManager.style.display = "block";
  settingsFormEl.style.display = "none";
  editorActions.style.display = "none";
  editorTitle.textContent = t("quickSendRules");

  // Show/hide no-rules message
  const rules = store.quickSendRules || [];
  if (rules.length === 0) {
    noRulesEl.classList.remove("hidden");
  } else {
    noRulesEl.classList.add("hidden");
  }
}

function showSettings(store) {
  editorMode = "settings";
  currentTemplateId = null;
  currentRuleId = null;
  editorEmpty.style.display = "none";
  editorForm.style.display = "none";
  ruleEditorForm.style.display = "none";
  rulesManager.style.display = "none";
  settingsFormEl.style.display = "block";
  editorActions.style.display = "none";
  editorTitle.textContent = t("settingsDetail");

  // Sync settings state
  const theme = store.theme || "system";
  themeSelect.value = theme;
  applyTheme(theme);
  notificationMode = store.notificationMode || "off";
  notificationSelect.value = notificationMode;
  refreshNotificationPermission();
}

async function refreshNotificationPermission() {
  const check = ++notificationCheck;
  const panel = document.getElementById("notification-permission");
  if (notificationMode === "off") { panel.hidden = true; return; }
  let granted = false;
  try { granted = await chrome.permissions.contains({ permissions: ["notifications"] }); }
  catch { /* Keep the saved preference and offer an explicit permission request. */ }
  if (check === notificationCheck) panel.hidden = granted;
}

// ─── Settings items ───

function selectSettingsItem(itemKey) {
  currentSettingsItem = itemKey;
  for (const li of settingsListEl.children) {
    li.classList.toggle("active", li.dataset.settings === itemKey);
  }
}

// ─── Template list ───

function renderTemplateList(templates, activeId) {
  templateListEl.innerHTML = "";

  // "+ New Webhook" action item (always first)
  const newLi = document.createElement("li");
  newLi.className = "new-item";
  newLi.id = "new-template";
  makeKeyboardItem(newLi);

  const newIcon = document.createElement("span");
  newIcon.className = "new-icon";
  newIcon.textContent = "+";

  const newLabel = document.createElement("span");
  newLabel.textContent = t("newWebhook");

  newLi.appendChild(newIcon);
  newLi.appendChild(newLabel);
  newLi.addEventListener("click", handleNewTemplate);
  templateListEl.appendChild(newLi);

  for (const tpl of templates) {
    const li = document.createElement("li");
    li.dataset.id = tpl.id;
    makeKeyboardItem(li);
    if (editorMode === "template" && tpl.id === activeId) li.classList.add("active");

    const nameSpan = document.createElement("span");
    nameSpan.className = "template-name";
    nameSpan.textContent = tpl.name || t("defaultTemplateName");

    li.appendChild(nameSpan);
    li.addEventListener("click", () => selectTemplate(tpl.id));
    templateListEl.appendChild(li);
  }
}

async function handleNewTemplate() {
  const tpl = await createTemplate(t("defaultTemplateName"));
  currentTemplateId = tpl.id;
  editorMode = "template";
  openPanel("panel-webhooks");
  await renderAll();
}

async function selectTemplate(id) {
  currentTemplateId = id;
  const store = await loadStore();
  const tpl = store.templates.find((t) => t.id === id);
  if (!tpl) return;

  // Ensure webhooks panel is active in sidebar
  openPanel("panel-webhooks");

  showTemplateEditor();

  // Highlight in template list
  for (const li of templateListEl.children) {
    li.classList.toggle("active", li.dataset.id === id);
  }

  // Clear rule list highlights
  for (const li of rulesListEl.children) {
    li.classList.remove("active");
  }

  // Fill form
  nameInput.value = tpl.name || "";
  urlInput.value = tpl.url || "";
  methodSelect.value = tpl.method || "POST";

  paramsList.innerHTML = "";
  if (tpl.params) {
    for (const { key, value } of tpl.params) {
      paramsList.appendChild(createParamRow(key, value));
    }
  }
  showHeaderValues.checked = false;
  headersList.replaceChildren();
  for (const { key, value } of tpl.headers || []) headersList.appendChild(createParamRow(key, value, "header"));
  document.getElementById("template-advanced").open = false;
  document.getElementById("read-response").checked = tpl.response?.enabled === true;
  document.getElementById("response-fields").disabled = !document.getElementById("read-response").checked;
  document.getElementById("response-message-path").value = tpl.response?.messagePath || "";
  document.getElementById("response-id-path").value = tpl.response?.receiptPath || "";
  document.getElementById("response-success-path").value = tpl.response?.successPath || "";
  document.getElementById("response-success-value").value = tpl.response?.successValue ?? "true";
  document.getElementById("duplicate-protection").checked = tpl.duplicateWindow > 0;
  document.getElementById("duplicate-window").value = tpl.duplicateWindow || 10;
  document.getElementById("duplicate-window").disabled = !document.getElementById("duplicate-protection").checked;
  lastValueInput = null;
  updatePreview();
}

// ─── Rules list (sidebar) ───

function renderRulesList(rules) {
  rulesListEl.innerHTML = "";

  // "+ Add Rule" action item (always first)
  const newLi = document.createElement("li");
  newLi.className = "new-item";
  newLi.id = "add-rule";
  makeKeyboardItem(newLi);

  const newIcon = document.createElement("span");
  newIcon.className = "new-icon";
  newIcon.textContent = "+";

  const newLabel = document.createElement("span");
  newLabel.textContent = t("addRule");

  newLi.appendChild(newIcon);
  newLi.appendChild(newLabel);
  newLi.addEventListener("click", handleNewRule);
  rulesListEl.appendChild(newLi);

  for (const rule of rules) {
    const li = document.createElement("li");
    li.dataset.id = rule.id;
    makeKeyboardItem(li);
    if (editorMode === "rule" && rule.id === currentRuleId) li.classList.add("active");
    if (!rule.enabled) li.classList.add("disabled");

    const summary = document.createElement("span");
    summary.className = "rule-summary";

    const fieldSpan = document.createElement("span");
    fieldSpan.className = "rule-field";
    fieldSpan.textContent = rule.field === "url" ? t("ruleFieldUrl") : t("ruleFieldTitle");

    const opSpan = document.createElement("span");
    opSpan.className = "rule-operator";
    opSpan.textContent = " " + getOperatorLabel(rule.operator) + " ";

    const valSpan = document.createElement("span");
    valSpan.className = "rule-value";
    valSpan.textContent = rule.value || "...";

    summary.appendChild(fieldSpan);
    summary.appendChild(opSpan);
    summary.appendChild(valSpan);

    li.appendChild(summary);
    li.addEventListener("click", () => selectRule(rule.id));

    rulesListEl.appendChild(li);
  }
}

async function handleNewRule() {
  const store = await loadStore();
  if (store.templates.length === 0) {
    noRulesEl.textContent = t("createTemplateFirst");
    noRulesEl.classList.remove("hidden");
    return;
  }
  const rule = await addQuickSendRule({
    field: "url",
    operator: "contains",
    value: "",
    templateId: store.templates[0].id,
  });
  currentRuleId = rule.id;
  editorMode = "rule";
  openPanel("panel-rules");
  await renderAll();
}

function getOperatorLabel(op) {
  const labels = {
    contains: t("ruleOperatorContains"),
    equals: t("ruleOperatorEquals"),
    startsWith: t("ruleOperatorStartsWith"),
    endsWith: t("ruleOperatorEndsWith"),
    matches: t("ruleOperatorMatches"),
  };
  return labels[op] || op;
}

async function selectRule(id) {
  currentRuleId = id;
  const store = await loadStore();
  const rule = store.quickSendRules.find((r) => r.id === id);
  if (!rule) return;

  showRuleEditor();

  // Highlight in rules list
  for (const li of rulesListEl.children) {
    li.classList.toggle("active", li.dataset.id === id);
  }

  // Clear template list highlights
  for (const li of templateListEl.children) {
    li.classList.remove("active");
  }

  // Fill rule form
  ruleFieldSelect.value = rule.field;
  ruleOperatorSelect.value = rule.operator;
  ruleValueInput.value = rule.value || "";
  ruleEnabledToggle.checked = rule.enabled;

  // Populate template dropdown
  populateRuleTemplateSelect(store.templates, rule.templateId);
  document.getElementById("rule-up").disabled = store.quickSendRules[0].id === id;
  document.getElementById("rule-down").disabled = store.quickSendRules.at(-1).id === id;
  document.getElementById("rule-test-result").textContent = "";
}

function populateRuleTemplateSelect(templates, selectedId) {
  ruleTemplateSelect.innerHTML = "";
  for (const tpl of templates) {
    const option = document.createElement("option");
    option.value = tpl.id;
    option.textContent = tpl.name || t("defaultTemplateName");
    if (tpl.id === selectedId) option.selected = true;
    ruleTemplateSelect.appendChild(option);
  }
}

// ─── Save ───

async function saveCurrentTemplate() {
  if (!currentTemplateId) return;
  if (!urlInput.reportValidity()) return;
  if (document.getElementById("duplicate-protection").checked && !document.getElementById("duplicate-window").reportValidity()) return;

  const changes = {
    name: nameInput.value.trim() || t("defaultTemplateName"),
    url: urlInput.value.trim(),
    method: methodSelect.value,
    params: getParams(),
    headers: getParams(headersList, "header"),
    response: getResponseConfig(),
    duplicateWindow: document.getElementById("duplicate-protection").checked ? Number(document.getElementById("duplicate-window").value) : 0,
  };

  buildHeaders(changes.headers, { send: { id: "{{send.id}}" } });
  validateResponseConfig(changes.response);

  await updateTemplate(currentTemplateId, changes);

  // Update sidebar name
  const li = templateListEl.querySelector(`[data-id="${currentTemplateId}"]`);
  if (li) {
    const nameSpan = li.querySelector(".template-name");
    if (nameSpan) nameSpan.textContent = changes.name;
  }

  showStatus(t("saved"));
}

async function saveCurrentRule() {
  if (!currentRuleId) return;
  if (ruleOperatorSelect.value === "matches") {
    try { new RegExp(ruleValueInput.value, "i"); }
    catch { showStatus(t("invalidRegex"), true); return; }
  }

  const changes = {
    field: ruleFieldSelect.value,
    operator: ruleOperatorSelect.value,
    value: ruleValueInput.value.trim(),
    templateId: ruleTemplateSelect.value,
    enabled: ruleEnabledToggle.checked,
  };

  await updateQuickSendRule(currentRuleId, changes);

  // Re-render rules list to update summary and no-rules message
  const store = await loadStore();
  renderRulesList(store.quickSendRules);
  const rules = store.quickSendRules || [];
  if (rules.length === 0) {
    noRulesEl.classList.remove("hidden");
  } else {
    noRulesEl.classList.add("hidden");
  }

  showStatus(t("saved"));
}

async function handleSave() {
  saveBtn.disabled = true;
  try {
    if (editorMode === "template") await saveCurrentTemplate();
    else if (editorMode === "rule") await saveCurrentRule();
  } catch (error) {
    showStatus(error.message ? t(error.message) : t("requestFailed"), true);
  } finally {
    saveBtn.disabled = false;
  }
}

// ─── Delete ───

async function deleteCurrentTemplate() {
  if (!currentTemplateId) return;

  const store = await loadStore();
  const tpl = store.templates.find((t) => t.id === currentTemplateId);
  const name = tpl?.name || t("defaultTemplateName");

  if (!confirm(t("deleteConfirm", [name]))) return;

  await deleteTemplate(currentTemplateId);
  currentTemplateId = null;
  editorMode = null;
  await renderAll();
}

async function deleteCurrentRule() {
  if (!currentRuleId) return;

  await deleteQuickSendRule(currentRuleId);
  currentRuleId = null;
  // Stay in rules context — show rules manager
  editorMode = "rules-list";
  await renderAll();
}

async function handleDelete() {
  if (editorMode === "template") {
    await deleteCurrentTemplate();
  } else if (editorMode === "rule") {
    await deleteCurrentRule();
  }
}

// ─── Panel helpers ───

function openPanel(panelId) {
  const panels = document.querySelectorAll(".sidebar-panel");
  for (const p of panels) {
    p.classList.remove("active");
  }
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add("active");
}

// ─── Init ───

async function renderAll() {
  const store = await loadStore();
  applyTheme(store.theme);
  renderTemplateList(store.templates, currentTemplateId);

  if (editorMode === "template") {
    if (currentTemplateId && store.templates.find((t) => t.id === currentTemplateId)) {
      await selectTemplate(currentTemplateId);
    } else if (store.templates.length > 0) {
      await selectTemplate(store.templates[0].id);
    } else {
      showEditorEmpty();
    }
  } else if (editorMode === "rule") {
    renderRulesList(store.quickSendRules);
    if (currentRuleId && store.quickSendRules.find((r) => r.id === currentRuleId)) {
      await selectRule(currentRuleId);
    } else if (store.quickSendRules.length > 0) {
      await selectRule(store.quickSendRules[0].id);
    } else {
      showRulesManager(store);
    }
  } else if (editorMode === "rules-list") {
    renderRulesList(store.quickSendRules);
    showRulesManager(store);
  } else if (editorMode === "settings") {
    showSettings(store);
  } else {
    // Initial load — select first template if available
    if (store.templates.length > 0) {
      await selectTemplate(store.templates[0].id);
    } else {
      showEditorEmpty();
    }
  }
}

// ─── Events ───

addParamBtn.addEventListener("click", () => {
  const row = createParamRow();
  paramsList.appendChild(row);
  row.querySelector(".param-value").focus();
  updatePreview();
});
document.getElementById("add-header").addEventListener("click", () => {
  const row = createParamRow("", "", "header");
  headersList.appendChild(row);
  row.querySelector(".header-key").focus();
  updatePreview();
});
showHeaderValues.addEventListener("change", () => {
  for (const input of headersList.querySelectorAll(".header-value")) input.type = showHeaderValues.checked ? "text" : "password";
});
document.getElementById("read-response").addEventListener("change", (event) => {
  document.getElementById("response-fields").disabled = !event.target.checked;
  updatePreview();
});
document.getElementById("duplicate-protection").addEventListener("change", (event) => {
  document.getElementById("duplicate-window").disabled = !event.target.checked;
});

editorForm.addEventListener("input", updatePreview);
document.getElementById("empty-new-template").addEventListener("click", handleNewTemplate);
document.getElementById("empty-add-rule").addEventListener("click", handleNewRule);
for (const list of [templateListEl, rulesListEl, settingsListEl]) {
  list.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.target.closest("li").click();
    }
  });
}
for (const button of document.querySelectorAll("[data-variable]")) {
  button.addEventListener("click", () => {
    if (!lastValueInput || !lastValueInput.isConnected) {
      const row = createParamRow();
      paramsList.appendChild(row);
      lastValueInput = row.querySelector(".param-value");
    }
    lastValueInput.setRangeText(button.dataset.variable, lastValueInput.selectionStart, lastValueInput.selectionEnd, "end");
    lastValueInput.focus();
    updatePreview();
  });
}
document.getElementById("test-rule").addEventListener("click", () => {
  const matches = matchRule({ field: ruleFieldSelect.value, operator: ruleOperatorSelect.value, value: ruleValueInput.value }, { [ruleFieldSelect.value]: document.getElementById("rule-sample").value });
  const result = document.getElementById("rule-test-result");
  result.textContent = t(matches ? "ruleMatches" : "ruleNoMatch");
  result.classList.toggle("error", !matches);
});
async function moveRule(direction) {
  const store = await loadStore();
  const ids = store.quickSendRules.map((rule) => rule.id);
  const from = ids.indexOf(currentRuleId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  await reorderQuickSendRules(ids);
  renderRulesList((await loadStore()).quickSendRules);
  document.getElementById("rule-up").disabled = to === 0;
  document.getElementById("rule-down").disabled = to === ids.length - 1;
  showStatus(t("saved"));
}
document.getElementById("rule-up").addEventListener("click", () => moveRule(-1).catch((error) => showStatus(error.message, true)));
document.getElementById("rule-down").addEventListener("click", () => moveRule(1).catch((error) => showStatus(error.message, true)));

saveBtn.addEventListener("click", handleSave);
deleteBtn.addEventListener("click", handleDelete);

themeSelect.addEventListener("change", async () => {
  const theme = themeSelect.value;
  await setTheme(theme);
  applyTheme(theme);
});

async function saveNotifications() {
  const mode = notificationSelect.value;
  const status = document.getElementById("preferences-status");
  notificationSelect.disabled = true;
  document.getElementById("grant-notification-permission").disabled = true;
  try {
    // Call from the change gesture before any other await.
    if (mode !== "off" && !await chrome.permissions.request({ permissions: ["notifications"] })) throw new Error("notificationDenied");
    await setNotificationMode(mode);
    notificationMode = mode;
    status.textContent = t("saved");
    status.classList.remove("error");
  } catch (error) {
    notificationSelect.value = notificationMode;
    status.textContent = t(error.message);
    status.classList.add("error");
  } finally {
    notificationSelect.disabled = false;
    document.getElementById("grant-notification-permission").disabled = false;
    await refreshNotificationPermission();
  }
}
notificationSelect.addEventListener("change", saveNotifications);
document.getElementById("grant-notification-permission").addEventListener("click", saveNotifications);
chrome.permissions?.onRemoved?.addListener(refreshNotificationPermission);
chrome.permissions?.onAdded?.addListener(refreshNotificationPermission);
window.addEventListener("focus", refreshNotificationPermission);

// ─── Start ───

document.getElementById("version").textContent =
  "v" + chrome.runtime.getManifest().version;

initSidebar();
applyI18n();
migrateFromLegacy().then(renderAll).catch((error) => showStatus(error.message, true));
