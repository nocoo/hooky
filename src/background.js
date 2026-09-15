import { sendWebhook, sendAnyway } from "./send.js";
import { getDuplicateCapture } from "./duplicates.js";
import { openPanel, recoverPendingResults } from "./feedback.js";
import { handleQuickSend } from "./quicksend.js";
import { buildContextMenus, handleContextMenuClick } from "./contextmenu.js";

const STORE_KEY = "hooky";
const ready = recoverPendingResults().catch(() => {});

// Handle webhook execution requests from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (["EXECUTE_WEBHOOK", "GET_DUPLICATE_CAPTURE", "SEND_ANYWAY"].includes(message.type)) {
    const popupUrl = chrome.runtime.getURL("src/popup/popup.html");
    if (sender.id !== chrome.runtime.id || sender.url?.split(/[?#]/)[0] !== popupUrl) {
      sendResponse({ ok: false, state: "failed", error: "requestFailed" });
      return false;
    }
  }
  if (message.type === "GET_DUPLICATE_CAPTURE") {
    sendResponse(getDuplicateCapture(message.token));
    return false;
  }
  if (message.type === "SEND_ANYWAY") {
    ready.then(() => sendAnyway(message.token)).then(sendResponse).catch(() => sendResponse({ ok: false, state: "failed", error: "requestFailed" }));
    return true;
  }
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
