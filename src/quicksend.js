import { executeWebhook } from "./webhook.js";

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
 * Collect page context from a tab, falling back to basic tab info
 * when the content script is unavailable.
 *
 * @param {chrome.tabs.Tab} tab
 * @returns {Promise<object>} context with { page: { url, title, selection, meta } }
 */
async function getPageContext(tab) {
  if (!tab?.id) {
    return {
      page: {
        url: tab?.url || "",
        title: tab?.title || "",
        selection: "",
        meta: {},
      },
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PAGE_CONTEXT",
    });
    return (
      response || {
        page: {
          url: tab.url || "",
          title: tab.title || "",
          selection: "",
          meta: {},
        },
      }
    );
  } catch {
    return {
      page: {
        url: tab.url || "",
        title: tab.title || "",
        selection: "",
        meta: {},
      },
    };
  }
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
 * Handle a quick-send trigger: load config, gather page context,
 * execute the webhook, and show badge feedback.
 *
 * @param {chrome.tabs.Tab} tab - The active tab when the icon was clicked
 */
export async function handleQuickSend(tab) {
  const data = await chrome.storage.local.get("webhook");
  const config = data.webhook;

  if (!config || !config.url) return;

  const context = await getPageContext(tab);
  const result = await executeWebhook(config, context);

  flashBadge(result.ok);
}
