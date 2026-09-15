import { sendWebhook } from "./send.js";
import { openPanel } from "./feedback.js";
import { getPageContext } from "./pagecontext.js";
import { findMatchingRule } from "./rules.js";

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
    await openPanel();
    return;
  }

  const rules = store.quickSendRules || [];
  const context = await getPageContext(tab);
  const page = context.page || {};

  const matchedRule = findMatchingRule(rules, page);
  if (matchedRule) {
    const config = store.templates.find((t) => t.id === matchedRule.templateId);
    if (config && config.url) {
      await sendWebhook(config, context, { tab, source: "quick" });
      return;
    }
  }

  // No rules matched or matched template invalid → open popup
  await openPanel();
}
