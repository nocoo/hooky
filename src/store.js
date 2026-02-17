/**
 * Multi-template storage module.
 *
 * Data shape in chrome.storage.local:
 * {
 *   hooky: {
 *     templates: [ { id, name, url, method, params } ],
 *     activeTemplateId: string | null,
 *     quickSendRules: [ { id, field, operator, value, templateId, enabled } ],
 *     theme: "system" | "light" | "dark",
 *   }
 * }
 */

const STORE_KEY = "hooky";

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Load the full store from chrome.storage.local.
 * @returns {Promise<{templates: Array, activeTemplateId: string|null, quickSendRules: Array, theme: string}>}
 */
export async function loadStore() {
  const data = await chrome.storage.local.get(STORE_KEY);
  const store = data[STORE_KEY] || { templates: [], activeTemplateId: null, quickSendRules: [], theme: "system" };
  if (!store.quickSendRules) store.quickSendRules = [];
  return store;
}

/**
 * Save the full store to chrome.storage.local.
 * @param {object} store
 */
export async function saveStore(store) {
  await chrome.storage.local.set({ [STORE_KEY]: store });
}

/**
 * Create a new template with a given name and default values.
 * Sets it as active if it's the first template.
 *
 * @param {string} name
 * @returns {Promise<object>} The created template
 */
export async function createTemplate(name) {
  const store = await loadStore();
  const tpl = {
    id: generateId(),
    name,
    url: "",
    method: "POST",
    params: [],
  };
  store.templates.push(tpl);
  if (store.activeTemplateId === null) {
    store.activeTemplateId = tpl.id;
  }
  await saveStore(store);
  return tpl;
}

/**
 * Update an existing template by id (partial update).
 *
 * @param {string} id
 * @param {object} changes - Fields to update (name, url, method, params)
 */
export async function updateTemplate(id, changes) {
  const store = await loadStore();
  const tpl = store.templates.find((t) => t.id === id);
  if (!tpl) throw new Error("Template not found");
  Object.assign(tpl, changes);
  await saveStore(store);
}

/**
 * Delete a template by id.
 * If the active template is deleted, switch to the next available one.
 *
 * @param {string} id
 */
export async function deleteTemplate(id) {
  const store = await loadStore();
  store.templates = store.templates.filter((t) => t.id !== id);
  if (store.activeTemplateId === id) {
    store.activeTemplateId = store.templates.length > 0 ? store.templates[0].id : null;
  }
  if (store.quickSendRules) {
    store.quickSendRules = store.quickSendRules.filter((r) => r.templateId !== id);
  }
  await saveStore(store);
}

/**
 * Get a single template by id.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getTemplate(id) {
  const store = await loadStore();
  return store.templates.find((t) => t.id === id) || null;
}

/**
 * Get the currently active template.
 *
 * @returns {Promise<object|null>}
 */
export async function getActiveTemplate() {
  const store = await loadStore();
  if (!store.activeTemplateId) return null;
  return store.templates.find((t) => t.id === store.activeTemplateId) || null;
}

/**
 * Set the active template id.
 *
 * @param {string} id
 */
export async function setActiveTemplateId(id) {
  const store = await loadStore();
  store.activeTemplateId = id;
  await saveStore(store);
}

/**
 * Get all quick send rules.
 *
 * @returns {Promise<Array>}
 */
export async function getQuickSendRules() {
  const store = await loadStore();
  return store.quickSendRules;
}

/**
 * Add a new quick send rule.
 *
 * @param {object} rule - { field, operator, value, templateId }
 * @returns {Promise<object>} The created rule (with id and enabled)
 */
export async function addQuickSendRule(rule) {
  const store = await loadStore();
  const newRule = {
    id: generateId(),
    field: rule.field,
    operator: rule.operator,
    value: rule.value,
    templateId: rule.templateId,
    enabled: true,
  };
  store.quickSendRules.push(newRule);
  await saveStore(store);
  return newRule;
}

/**
 * Update an existing quick send rule by id (partial update).
 *
 * @param {string} id
 * @param {object} changes
 */
export async function updateQuickSendRule(id, changes) {
  const store = await loadStore();
  const rule = store.quickSendRules.find((r) => r.id === id);
  if (!rule) throw new Error("Rule not found");
  Object.assign(rule, changes);
  await saveStore(store);
}

/**
 * Delete a quick send rule by id.
 *
 * @param {string} id
 */
export async function deleteQuickSendRule(id) {
  const store = await loadStore();
  store.quickSendRules = store.quickSendRules.filter((r) => r.id !== id);
  await saveStore(store);
}

/**
 * Reorder quick send rules by an array of ids.
 *
 * @param {Array<string>} orderedIds
 */
export async function reorderQuickSendRules(orderedIds) {
  const store = await loadStore();
  const ruleMap = new Map(store.quickSendRules.map((r) => [r.id, r]));
  store.quickSendRules = orderedIds.map((id) => ruleMap.get(id)).filter(Boolean);
  await saveStore(store);
}

/**
 * Get the theme setting.
 *
 * @returns {Promise<string>} "system" | "light" | "dark"
 */
export async function getTheme() {
  const store = await loadStore();
  return store.theme || "system";
}

/**
 * Set the theme setting.
 *
 * @param {string} theme - "system" | "light" | "dark"
 */
export async function setTheme(theme) {
  const store = await loadStore();
  store.theme = theme;
  await saveStore(store);
}

/**
 * Migrate from the legacy single-webhook format ({ webhook: {...} })
 * to the new multi-template format. Only runs if no templates exist yet
 * and legacy data is present.
 */
export async function migrateFromLegacy() {
  const store = await loadStore();
  if (store.templates.length > 0) return;

  const data = await chrome.storage.local.get("webhook");
  const legacy = data.webhook;
  if (!legacy) return;

  const tpl = {
    id: generateId(),
    name: "Webhook",
    url: legacy.url || "",
    method: legacy.method || "POST",
    params: legacy.params || [],
  };
  store.templates.push(tpl);
  store.activeTemplateId = tpl.id;
  await saveStore(store);
}
