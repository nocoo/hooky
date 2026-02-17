import { executeWebhook } from "./webhook.js";
import { getPageContext } from "./pagecontext.js";
import { findMatchingRule } from "./rules.js";

const POPUP_PATH = "src/popup/popup.html";
const BADGE_CLEAR_DELAY = 3000;

/**
 * Toggle between popup mode and quick-send mode.
 * When quick send is enabled, remove the popup so that
 * chrome.action.onClicked fires instead.
 *
 * @param {boolean} enabled - Whether quick send is on
 */
export function applyQuickSendMode(enabled) {
  chrome.action.setPopup({ popup: enabled ? "" : POPUP_PATH });
}

/**
 * Show a brief badge on the extension icon to indicate success/failure.
 *
 * @param {boolean} success
 */
function flashBadge(success) {
  chrome.action.setBadgeText({ text: success ? "✓" : "✗" });
  chrome.action.setBadgeBackgroundColor({
    color: success ? "#4a9" : "#c44",
  });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), BADGE_CLEAR_DELAY);
}

/**
 * Temporarily open the popup as a fallback when no rules match
 * and no fallback template is set.
 */
function openPopupFallback() {
  chrome.action.setPopup({ popup: POPUP_PATH });
  chrome.action.openPopup();
}

/**
 * Handle a quick-send trigger: load active template from store,
 * gather page context, execute the webhook, and show badge feedback.
 *
 * Resolution order for new multi-template format:
 * 1. Match quickSendRules against page context (first enabled match wins)
 * 2. Fall back to quickSendTemplateId
 * 3. Fall back to first template (only when no rules exist)
 * 4. Open popup if nothing matched
 *
 * @param {chrome.tabs.Tab} tab - The active tab when the icon was clicked
 */
export async function handleQuickSend(tab) {
  const storeKey = "hooky";
  const data = await chrome.storage.local.get([storeKey, "webhook"]);

  let config = null;

  if (data[storeKey]) {
    const store = data[storeKey];
    if (!store.templates || store.templates.length === 0) return;

    const rules = store.quickSendRules || [];
    const context = await getPageContext(tab);
    const page = context.page || {};

    // 1. Try rules
    const matchedRule = findMatchingRule(rules, page);
    if (matchedRule) {
      config = store.templates.find((t) => t.id === matchedRule.templateId);
    }

    // 2. Fall back to quickSendTemplateId
    if (!config && store.quickSendTemplateId) {
      config = store.templates.find((t) => t.id === store.quickSendTemplateId);
    }

    // 3. Fall back to first template (only when no rules are configured)
    if (!config && rules.length === 0) {
      config = store.templates[0];
    }

    // 4. Open popup fallback
    if (!config || !config.url) {
      openPopupFallback();
      return;
    }

    const result = await executeWebhook(config, context);
    flashBadge(result.ok);
    return;
  }

  if (data.webhook) {
    // Legacy single-webhook format
    config = data.webhook;
  }

  if (!config || !config.url) return;

  const context = await getPageContext(tab);
  const result = await executeWebhook(config, context);
  flashBadge(result.ok);
}
