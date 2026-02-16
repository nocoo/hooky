import { executeWebhook } from "./webhook.js";

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
