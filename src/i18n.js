/**
 * Apply i18n translations to all elements with data-i18n attributes.
 *
 * Supported attribute formats:
 *   data-i18n="messageName"              → sets textContent
 *   data-i18n-placeholder="messageName"  → sets placeholder attribute
 *   data-i18n-title="messageName"        → sets title attribute
 */
export function applyI18n() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  }

  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = el.getAttribute("data-i18n-placeholder");
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.placeholder = msg;
  }

  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    const key = el.getAttribute("data-i18n-title");
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.title = msg;
  }
}

/**
 * Get a translated message by key, with optional substitutions.
 *
 * @param {string} key - Message key from messages.json
 * @param {string|string[]} [substitutions] - Substitution values
 * @returns {string}
 */
export function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}
