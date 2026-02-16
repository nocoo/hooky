import { executeWebhook } from "./webhook.js";
import { applyQuickSendMode, handleQuickSend } from "./quicksend.js";
import { buildContextMenus, handleContextMenuClick } from "./contextmenu.js";

const STORE_KEY = "hooky";

// Handle webhook execution requests from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXECUTE_WEBHOOK") {
    const { config, context } = message;

    executeWebhook(config, context).then((result) => {
      sendResponse(result);
    });

    // Return true to indicate async response
    return true;
  }
});

// Apply quick-send mode and build context menus on startup
chrome.storage.local.get(STORE_KEY).then((data) => {
  const store = data[STORE_KEY];
  const quickSend = store?.quickSend || false;
  applyQuickSendMode(quickSend);
  buildContextMenus(store?.templates || []);
});

// React to config changes (e.g. user toggles quick send, adds/removes templates)
chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORE_KEY]?.newValue) {
    const store = changes[STORE_KEY].newValue;
    applyQuickSendMode(store.quickSend || false);
    buildContextMenus(store.templates || []);
  }
});

// Handle icon click when popup is disabled (quick-send mode)
chrome.action.onClicked.addListener((tab) => {
  handleQuickSend(tab);
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleContextMenuClick(info, tab);
});
