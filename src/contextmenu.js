import { executeWebhook } from "./webhook.js";
import { getPageContext } from "./pagecontext.js";

const PARENT_ID = "hooky-parent";
const PREFIX = "hooky-";
const BADGE_CLEAR_DELAY = 3000;
const STORE_KEY = "hooky";
const CONTEXTS = ["page", "selection", "link", "image"];

/**
 * Build (or rebuild) the right-click context menu tree.
 *
 * Creates a parent "Hooky" item with one child per template.
 * Clears all existing menus first so this is safe to call repeatedly.
 *
 * @param {Array<{id: string, name: string}>} templates
 */
export async function buildContextMenus(templates) {
  await chrome.contextMenus.removeAll();

  if (!templates || templates.length === 0) return;

  chrome.contextMenus.create({
    id: PARENT_ID,
    title: "Hooky",
    contexts: CONTEXTS,
  });

  for (const tpl of templates) {
    chrome.contextMenus.create({
      id: `${PREFIX}${tpl.id}`,
      parentId: PARENT_ID,
      title: tpl.name || "Untitled",
      contexts: CONTEXTS,
    });
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
 * Handle a context menu click.
 *
 * Ignores clicks on the parent item or items not belonging to Hooky.
 * Extracts the template id from the menu item id, loads the template
 * from storage, gathers page context, executes the webhook, and
 * flashes a badge for feedback.
 *
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 */
export async function handleContextMenuClick(info, tab) {
  const menuId = String(info.menuItemId);

  // Ignore non-hooky items or parent click
  if (!menuId.startsWith(PREFIX) || menuId === PARENT_ID) return;

  const templateId = menuId.slice(PREFIX.length);

  // Load store and find template
  const data = await chrome.storage.local.get(STORE_KEY);
  const store = data[STORE_KEY];
  if (!store?.templates) return;

  const config = store.templates.find((t) => t.id === templateId);
  if (!config || !config.url) return;

  const context = await getPageContext(tab);
  const result = await executeWebhook(config, context);

  flashBadge(result.ok);
}
