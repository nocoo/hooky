import { sendWebhook } from "./send.js";
import { openPanel, recoverPendingResults } from "./feedback.js";
import { handleQuickSend } from "./quicksend.js";
import { buildContextMenus, handleContextMenuClick } from "./contextmenu.js";

const STORE_KEY = "hooky";
const ready = recoverPendingResults().catch(() => {});

// Handle webhook execution requests from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXECUTE_WEBHOOK") {
    const { config, context } = message;

    ready.then(() => sendWebhook(config, context, { tab: message.tab, source: "popup", resolved: message.resolved === true })).then((result) => {
      sendResponse(result);
    }).catch(() => sendResponse({ ok: false, state: "failed", error: "requestFailed" }));

    // Return true to indicate async response
    return true;
  }
  if (message.type === "OPEN_PANEL") {
    openPanel().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

// Build context menus on startup
chrome.storage.local.get(STORE_KEY).then((data) => {
  const store = data[STORE_KEY];
  return buildContextMenus(store?.templates || []);
}).catch(() => {});

// React to config changes (e.g. user adds/removes templates)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORE_KEY]?.newValue) {
    const store = changes[STORE_KEY].newValue;
    buildContextMenus(store.templates || []).catch(() => {});
  }
});

// Handle icon click — always dispatch via handleQuickSend
chrome.action.onClicked.addListener((tab) => {
  ready.then(() => handleQuickSend(tab)).catch(() => openPanel().catch(() => {}));
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  ready.then(() => handleContextMenuClick(info, tab)).catch(() => openPanel().catch(() => {}));
});

chrome.notifications?.onClicked.addListener((id) => {
  if (id.startsWith("hooky:")) openPanel().catch(() => {});
});
