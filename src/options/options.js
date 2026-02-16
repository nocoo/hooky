import { applyI18n, t } from "../i18n.js";
import {
  loadStore,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setQuickSend,
  migrateFromLegacy,
} from "../store.js";

const templateListEl = document.getElementById("template-list");
const newTemplateBtn = document.getElementById("new-template");
const quickSendToggle = document.getElementById("quick-send");
const quickSendHint = document.getElementById("quick-send-hint");

const editorEmpty = document.getElementById("editor-empty");
const editorForm = document.getElementById("editor-form");
const nameInput = document.getElementById("template-name");
const urlInput = document.getElementById("webhook-url");
const methodSelect = document.getElementById("http-method");
const paramsList = document.getElementById("params-list");
const addParamBtn = document.getElementById("add-param");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");
const deleteBtn = document.getElementById("delete-template");

let currentTemplateId = null;

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

// ─── Template list ───

function renderTemplateList(templates, activeId) {
  templateListEl.innerHTML = "";
  for (const tpl of templates) {
    const li = document.createElement("li");
    li.textContent = tpl.name || t("defaultTemplateName");
    li.dataset.id = tpl.id;
    if (tpl.id === activeId) li.classList.add("active");
    li.addEventListener("click", () => selectTemplate(tpl.id));
    templateListEl.appendChild(li);
  }
}

async function selectTemplate(id) {
  currentTemplateId = id;
  const store = await loadStore();
  const tpl = store.templates.find((t) => t.id === id);
  if (!tpl) return;

  // Highlight in list
  for (const li of templateListEl.children) {
    li.classList.toggle("active", li.dataset.id === id);
  }

  // Show editor
  editorEmpty.style.display = "none";
  editorForm.style.display = "block";

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
  if (li) li.textContent = changes.name;

  showStatus(t("saved"));
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
  await renderAll();
}

// ─── Quick Send ───

function updateQuickSendHint() {
  quickSendHint.classList.toggle("visible", quickSendToggle.checked);
}

// ─── Init ───

async function renderAll() {
  const store = await loadStore();
  renderTemplateList(store.templates, store.activeTemplateId);
  quickSendToggle.checked = store.quickSend;
  updateQuickSendHint();

  if (store.templates.length > 0) {
    // Select the first template if none is selected
    const targetId = currentTemplateId && store.templates.find((t) => t.id === currentTemplateId)
      ? currentTemplateId
      : store.templates[0].id;
    await selectTemplate(targetId);
  } else {
    editorEmpty.style.display = "flex";
    editorForm.style.display = "none";
  }
}

// ─── Events ───

newTemplateBtn.addEventListener("click", async () => {
  const tpl = await createTemplate(t("defaultTemplateName"));
  currentTemplateId = tpl.id;
  await renderAll();
});

addParamBtn.addEventListener("click", () => {
  paramsList.appendChild(createParamRow());
});

saveBtn.addEventListener("click", saveCurrentTemplate);
deleteBtn.addEventListener("click", deleteCurrentTemplate);

quickSendToggle.addEventListener("change", async () => {
  await setQuickSend(quickSendToggle.checked);
  updateQuickSendHint();
});

// ─── Start ───

applyI18n();
migrateFromLegacy().then(() => renderAll());
