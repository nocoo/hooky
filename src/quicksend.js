import { executeWebhook } from "./webhook.js";
import { getPageContext } from "./pagecontext.js";
import { findMatchingRule } from "./rules.js";

const POPUP_PATH = "src/popup/popup.html";
const BADGE_CLEAR_DELAY = 3000;

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
 * Open the popup as a fallback when no rules match.
 */
function openPopupFallback() {
  chrome.action.setPopup({ popup: POPUP_PATH });
  chrome.action.openPopup();
}

/**
 * Handle a quick-send trigger: evaluate rules against the current page,
 * execute the matched template's webhook, and show badge feedback.
 *
 * Resolution:
 * 1. Match quickSendRules against page context (first enabled match wins)
 * 2. If matched rule's template exists and has URL → execute webhook
 * 3. If no rules match → open popup fallback
 *
 * @param {chrome.tabs.Tab} tab - The active tab when the icon was clicked
 */
export async function handleQuickSend(tab) {
  const storeKey = "hooky";
  const data = await chrome.storage.local.get(storeKey);
  const store = data[storeKey];

  if (!store || !store.templates || store.templates.length === 0) {
    openPopupFallback();
    return;
  }

  const rules = store.quickSendRules || [];
  const context = await getPageContext(tab);
  const page = context.page || {};

  const matchedRule = findMatchingRule(rules, page);
  if (matchedRule) {
    const config = store.templates.find((t) => t.id === matchedRule.templateId);
    if (config && config.url) {
      const result = await executeWebhook(config, context);
      flashBadge(result.ok);
      return;
    }
  }

  // No rules matched or matched template invalid → open popup
  openPopupFallback();
}
