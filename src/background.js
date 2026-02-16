import { executeWebhook } from "./webhook.js";
import { applyQuickSendMode, handleQuickSend } from "./quicksend.js";

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

// Apply quick-send mode on startup
chrome.storage.local.get("webhook").then((data) => {
  const quickSend = data.webhook?.quickSend || false;
  applyQuickSendMode(quickSend);
});

// React to config changes (e.g. user toggles quick send in options)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.webhook?.newValue) {
    const quickSend = changes.webhook.newValue.quickSend || false;
    applyQuickSendMode(quickSend);
  }
});

// Handle icon click when popup is disabled (quick-send mode)
chrome.action.onClicked.addListener((tab) => {
  handleQuickSend(tab);
});
