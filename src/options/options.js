import { applyI18n, t } from "../i18n.js";
import {
  loadStore,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setQuickSend,
  setQuickSendTemplateId,
  setTheme,
  migrateFromLegacy,
  addQuickSendRule,
  updateQuickSendRule,
  deleteQuickSendRule,
} from "../store.js";
import { applyTheme } from "../theme.js";

// ─── DOM refs ───

const templateListEl = document.getElementById("template-list");
const newTemplateBtn = document.getElementById("new-template");
const quickSendToggle = document.getElementById("quick-send");
const quickSendHint = document.getElementById("quick-send-hint");
const themeSelect = document.getElementById("theme-select");

const editorTitle = document.getElementById("editor-title");
const editorEmpty = document.getElementById("editor-empty");
const editorForm = document.getElementById("editor-form");
const ruleEditorForm = document.getElementById("rule-editor-form");
const editorActions = document.getElementById("editor-actions");
const editorQuickSendToggle = document.getElementById("editor-quick-send");
const nameInput = document.getElementById("template-name");
const urlInput = document.getElementById("webhook-url");
const methodSelect = document.getElementById("http-method");
const paramsList = document.getElementById("params-list");
const addParamBtn = document.getElementById("add-param");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");
const deleteBtn = document.getElementById("delete-template");

// Rules sidebar
const rulesListEl = document.getElementById("rules-list");
const noRulesEl = document.getElementById("no-rules");
const addRuleBtn = document.getElementById("add-rule");

// Rule editor fields
const ruleFieldSelect = document.getElementById("rule-field");
const ruleOperatorSelect = document.getElementById("rule-operator");
const ruleValueInput = document.getElementById("rule-value");
const ruleTemplateSelect = document.getElementById("rule-template");
const ruleEnabledToggle = document.getElementById("rule-enabled");

let currentTemplateId = null;
let currentRuleId = null;
let editorMode = null; // "template" | "rule" | null

// ─── Accordion ───

function initAccordion() {
  const triggers = document.querySelectorAll(".accordion-trigger");
  for (const trigger of triggers) {
    trigger.addEventListener("click", (e) => {
      // Don't toggle accordion when clicking action buttons inside trigger
      if (e.target.closest(".accordion-actions")) return;
      const panelId = trigger.dataset.panel;
      const panel = document.getElementById(panelId);
      if (!panel) return;

      if (panel.classList.contains("active")) return; // already open, no-op

      // Close all panels
      const panels = document.querySelectorAll(".accordion-panel");
      for (const p of panels) {
        p.classList.remove("active");
      }

      // Open clicked panel
      panel.classList.add("active");
    });
  }
}

// ─── Param row helpers ───

function createParamRow(key = "", value = "") {
  const row = document.createElement("div");
  row.className = "param-row";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.placeholder = t("paramKeyPlaceholder");
  keyInput.value = key;
  keyInput.className = "param-key";

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.placeholder = t("paramValuePlaceholder");
  valueInput.value = value;
  valueInput.className = "param-value";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-remove";
  removeBtn.textContent = "\u00d7";
  removeBtn.addEventListener("click", () => row.remove());

  row.appendChild(keyInput);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);

  return row;
}

function getParams() {
  const rows = paramsList.querySelectorAll(".param-row");
  const params = [];
  for (const row of rows) {
    const key = row.querySelector(".param-key").value.trim();
    const value = row.querySelector(".param-value").value.trim();
    params.push({ key, value });
  }
  return params;
}

// ─── Status flash ───

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.classList.add("visible");
  setTimeout(() => statusEl.classList.remove("visible"), 2000);
}

// ─── Editor state ───

function showEditorEmpty() {
  editorMode = null;
  currentTemplateId = null;
  currentRuleId = null;
  editorEmpty.style.display = "flex";
  editorForm.style.display = "none";
  ruleEditorForm.style.display = "none";
  editorActions.style.display = "none";
  editorTitle.textContent = t("webhookDetail");
}

function showTemplateEditor() {
  editorMode = "template";
  currentRuleId = null;
  editorEmpty.style.display = "none";
  editorForm.style.display = "block";
  ruleEditorForm.style.display = "none";
  editorActions.style.display = "flex";
  editorTitle.textContent = t("webhookDetail");
}

function showRuleEditor() {
  editorMode = "rule";
  currentTemplateId = null;
  editorEmpty.style.display = "none";
  editorForm.style.display = "none";
  ruleEditorForm.style.display = "block";
  editorActions.style.display = "flex";
  editorTitle.textContent = t("ruleDetail");
}

// ─── Template list ───

function renderTemplateList(templates, activeId, quickSendId) {
  templateListEl.innerHTML = "";
  for (const tpl of templates) {
    const li = document.createElement("li");
    li.dataset.id = tpl.id;
    if (editorMode === "template" && tpl.id === activeId) li.classList.add("active");

    const nameSpan = document.createElement("span");
    nameSpan.className = "template-name";
    nameSpan.textContent = tpl.name || t("defaultTemplateName");
    nameSpan.addEventListener("click", () => selectTemplate(tpl.id));

    const lightningBtn = document.createElement("button");
    lightningBtn.type = "button";
    lightningBtn.className = "btn-lightning";
    if (tpl.id === quickSendId) lightningBtn.classList.add("active");
    lightningBtn.textContent = "\u26a1";
    lightningBtn.title = tpl.id === quickSendId
      ? t("quickSendTargetActive")
      : t("quickSendTarget");
    lightningBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const newId = tpl.id === quickSendId ? null : tpl.id;
      await setQuickSendTemplateId(newId);
      await renderAll();
    });

    li.appendChild(nameSpan);
    li.appendChild(lightningBtn);
    templateListEl.appendChild(li);
  }
}

async function selectTemplate(id) {
  currentTemplateId = id;
  const store = await loadStore();
  const tpl = store.templates.find((t) => t.id === id);
  if (!tpl) return;

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

  // Sync editor Quick Send toggle
  editorQuickSendToggle.checked =
    store.quickSend && store.quickSendTemplateId === id;
}

// ─── Rules list ───

function renderRulesList(rules) {
  rulesListEl.innerHTML = "";

  if (rules.length === 0) {
    noRulesEl.classList.remove("hidden");
  } else {
    noRulesEl.classList.add("hidden");
  }

  for (const rule of rules) {
    const li = document.createElement("li");
    li.dataset.id = rule.id;
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

  const changes = {
    name: nameInput.value.trim() || t("defaultTemplateName"),
    url: urlInput.value.trim(),
    method: methodSelect.value,
    params: getParams(),
  };

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

  const changes = {
    field: ruleFieldSelect.value,
    operator: ruleOperatorSelect.value,
    value: ruleValueInput.value.trim(),
    templateId: ruleTemplateSelect.value,
    enabled: ruleEnabledToggle.checked,
  };

  await updateQuickSendRule(currentRuleId, changes);

  // Re-render rules list to update summary
  const store = await loadStore();
  renderRulesList(store.quickSendRules);

  showStatus(t("saved"));
}

async function handleSave() {
  if (editorMode === "template") {
    await saveCurrentTemplate();
  } else if (editorMode === "rule") {
    await saveCurrentRule();
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
  // Keep editorMode as "rule" so renderAll() stays in rule context
  // and shows empty state or selects next rule
  await renderAll();
}

async function handleDelete() {
  if (editorMode === "template") {
    await deleteCurrentTemplate();
  } else if (editorMode === "rule") {
    await deleteCurrentRule();
  }
}

// ─── Quick Send ───

function updateQuickSendHint() {
  quickSendHint.classList.toggle("visible", quickSendToggle.checked);
}

// ─── Init ───

async function renderAll() {
  const store = await loadStore();
  renderTemplateList(store.templates, currentTemplateId, store.quickSendTemplateId);
  renderRulesList(store.quickSendRules);
  quickSendToggle.checked = store.quickSend;
  updateQuickSendHint();

  // Apply theme
  const theme = store.theme || "system";
  themeSelect.value = theme;
  applyTheme(theme);

  if (editorMode === "template") {
    if (currentTemplateId && store.templates.find((t) => t.id === currentTemplateId)) {
      await selectTemplate(currentTemplateId);
    } else if (store.templates.length > 0) {
      await selectTemplate(store.templates[0].id);
    } else {
      showEditorEmpty();
    }
  } else if (editorMode === "rule") {
    if (currentRuleId && store.quickSendRules.find((r) => r.id === currentRuleId)) {
      await selectRule(currentRuleId);
    } else if (store.quickSendRules.length > 0) {
      await selectRule(store.quickSendRules[0].id);
    } else {
      showEditorEmpty();
    }
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

newTemplateBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  const tpl = await createTemplate(t("defaultTemplateName"));
  currentTemplateId = tpl.id;
  editorMode = "template";
  // Open templates panel
  openPanel("panel-templates");
  await renderAll();
});

addRuleBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  const store = await loadStore();
  if (store.templates.length === 0) return; // need at least one template
  const rule = await addQuickSendRule({
    field: "url",
    operator: "contains",
    value: "",
    templateId: store.templates[0].id,
  });
  currentRuleId = rule.id;
  editorMode = "rule";
  // Open rules panel
  openPanel("panel-rules");
  await renderAll();
});

function openPanel(panelId) {
  const panels = document.querySelectorAll(".accordion-panel");
  for (const p of panels) {
    p.classList.remove("active");
  }
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add("active");
}

addParamBtn.addEventListener("click", () => {
  paramsList.appendChild(createParamRow());
});

saveBtn.addEventListener("click", handleSave);
deleteBtn.addEventListener("click", handleDelete);

quickSendToggle.addEventListener("change", async () => {
  await setQuickSend(quickSendToggle.checked);
  updateQuickSendHint();
  // Sync editor toggle
  if (editorMode === "template" && currentTemplateId) {
    const store = await loadStore();
    editorQuickSendToggle.checked =
      store.quickSend && store.quickSendTemplateId === currentTemplateId;
  }
});

editorQuickSendToggle.addEventListener("change", async () => {
  const checked = editorQuickSendToggle.checked;
  await setQuickSend(checked);
  if (checked) {
    await setQuickSendTemplateId(currentTemplateId);
  } else {
    await setQuickSendTemplateId(null);
  }
  await renderAll();
});

themeSelect.addEventListener("change", async () => {
  const theme = themeSelect.value;
  await setTheme(theme);
  applyTheme(theme);
});

// ─── Start ───

document.getElementById("version").textContent =
  "v" + chrome.runtime.getManifest().version;

initAccordion();
applyI18n();
migrateFromLegacy().then(() => renderAll());
